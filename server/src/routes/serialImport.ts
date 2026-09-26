// ============================================================
// ورود سریال‌ها از فایل اکسل (قالب فهرست قطعات انبار)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// ورودی الزامی: فایل اکسل + project_id (پروژه/مشتری) + device_id (تجهیز هدف)
//   • هیچ آپلود «بی‌مقصد»ی پذیرفته نیست — بدون پروژه/دستگاه خطا برمی‌گردد.
// قالب اکسل (مطابق نمونه‌ی «چهار دستگاه سرور دیوان محاسبات»):
//   ردیف ۱: عنوان قطعه (Product / Case / Main Board / ...)
//   ردیف ۲: توضیحات/مدل (Description) — اختیاری
//   ردیف ۳: پارت‌نامبر (Part Number) — کلید تطبیق
//   ردیف ۴ به بعد: سریال‌ها (هر ردیف = یک دستگاه/یک مجموعه قطعه)
//   ستون A: شماره ردیف (نادیده گرفته می‌شود)
// ----------------------------------------------------------------
// منطق ثبت:
//   • پارت‌نامبر هر ستون اول داخل «دستگاه هدف» جستجو می‌شود، بعد کل سامانه.
//   • اگر قطعه وجود نداشت، قطعه‌ی جدید با عنوان ستون (ردیف ۱) + توضیحات
//     (ردیف ۲) + پارت‌نامبر (ردیف ۳) روی دستگاه هدف ساخته می‌شود.
//   • ستونی که پارت‌نامبرش مال خودِ دستگاه هدف باشد → main_serial به‌روز می‌شود.
//   • هیچ داده‌ای حذف نمی‌شود؛ اجرای دوباره امن است.
// ============================================================
import { Router } from 'express';
import type { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import jalaali from 'jalaali-js';
import { z } from 'zod';
import { getDb, runTransaction } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

interface ColumnMatch {
  colLetter: string;
  partNumber: string;
  title: string;
  desc: string;
  partIds: number[]; // قطعات موجود با این پارت‌نامبر (به ترتیب id)
  isNew: boolean;    // در این import ساخته می‌شود
  titleVariants: string[]; // عنوان‌های مختلف دیدده‌شده برای همین پارت‌نامبر
  descVariants: string[];  // توضیحات مختلف دیدده‌شده (برای انتخاب کاربر)
  perDeviceCounter: Map<number, number>; // مصرف رکوردها به تفکیک دستگاه مقصد
}

interface SerialCell {
  colLetter: string;
  value: string;
}

/** نرمال‌سازی پارت‌نامبر: حذف فاصله‌ها و نویسه‌های نامرئی، بزرگ‌کردن لاتین */
function normalizePartNumber(s: unknown): string {
  return String(s ?? '')
    .replace(/[\u200c\u200f\u200e\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** تبدیل شماره‌ی ستون اکسل (۱-مبنا) به حرف: 1→A, 27→AA */
function colLetter(index1: number): string {
  let s = '';
  let n = index1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** تبدیل شیت به آرایه‌ای از ردیف‌ها با کلید حرفِ ستون ({A:.., B:..}) */
function sheetToColumnRows(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: true,
  });
  return matrix.map((row) => {
    const obj: Record<string, string> = {};
    (row as unknown[]).forEach((v, i) => {
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        obj[colLetter(i + 1)] = String(v).trim();
      }
    });
    return obj;
  });
}

/** تشخیص ردیف هدرِ پارت‌نامبر (حداقل ۳ مقدار شبیه پارت‌نامبر) */
function looksLikePartNumberRow(row: Record<string, string>): boolean {
  const vals = Object.entries(row).filter(([k]) => k !== 'A');
  if (vals.length < 3) return false;
  let pnLike = 0;
  for (const [, v] of vals) {
    if (/^[A-Za-z0-9][A-Za-z0-9\-_]{5,19}$/.test(v)) pnLike++;
  }
  return pnLike >= Math.max(3, Math.ceil(vals.length * 0.5));
}

// POST /api/serial-import — آپلود اکسل مقید به پروژه/دستگاه (فقط admin)
router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('multipart/form-data')) {
    return void res
      .status(400)
      .json({ error: 'درخواست باید multipart/form-data باشد (فیلدهای file، project_id، device_id).' });
  }

  const chunks: Buffer[] = [];
  let total = 0;
  let aborted = false;
  req.on('data', (c: Buffer) => {
    total += c.length;
    if (total > 10 * 1024 * 1024) {
      aborted = true;
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('error', () => {
    /* اتصال قطع شد */
  });
  req.on('end', () => {
    if (aborted) {
      if (!res.headersSent) res.status(413).json({ error: 'حجم فایل بیش از حد مجاز است (حداکثر ۱۰ مگابایت).' });
      return;
    }
    try {
      handleUpload(Buffer.concat(chunks), String(req.headers['content-type'] || ''), req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'خطا در پردازش فایل.', detail: (err as Error).message });
      }
    }
  });
});

/** استخراج فیلدها از بدنه‌ی multipart دستی (بدون وابستگی اضافه) */
function parseMultipart(
  buffer: Buffer,
  contentType: string
): { file: { filename: string; data: Buffer } | null; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return { file: null, fields };
  const boundary = '--' + (m[1] || m[2]).trim();
  const bBoundary = Buffer.from(boundary);

  const parts: Buffer[] = [];
  let start = buffer.indexOf(bBoundary);
  while (start !== -1) {
    const next = buffer.indexOf(bBoundary, start + bBoundary.length);
    if (next === -1) break;
    parts.push(buffer.subarray(start + bBoundary.length, next));
    start = next;
  }

  let file: { filename: string; data: Buffer } | null = null;
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString('utf-8');
    const body = part.subarray(headerEnd + 4, part.length - 2);
    const nameM = /name="([^"]*)"/i.exec(headers);
    const fileM = /filename="([^"]*)"/i.exec(headers);
    if (!nameM) continue;
    if (fileM && nameM[1] === 'file' && fileM[1] && body.length > 0) {
      file = { filename: fileM[1], data: body };
    } else if (!fileM) {
      fields[nameM[1]] = body.toString('utf-8').trim();
    }
  }
  return { file, fields };
}

function handleUpload(body: Buffer, contentType: string, req: Request, res: Response): void {
  const { file, fields } = parseMultipart(body, contentType);

  // --- اعتبارسنجی مقصد: پروژه الزامی؛ دستگاه یا صریح یا «هر ردیف = یک دستگاه» ---
  const targetSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    device_id: z.coerce.number().int().positive().optional(),
    create_per_row: z
      .enum(['1', '0', 'true', 'false'])
      .optional()
      .transform((v) => v === '1' || v === 'true'),
  });
  const parsedTarget = targetSchema.safeParse(fields);
  if (!parsedTarget.success) {
    res.status(400).json({
      error: 'انتخاب پروژه و تجهیز مقصد الزامی است — آپلود بدون مقصد مجاز نیست.',
      detail: parsedTarget.error.flatten(),
    });
    return;
  }
  const { project_id, device_id, create_per_row } = parsedTarget.data;

  const db = getDb();

  // حالت «هر ردیف = یک دستگاه»: device_id اختیاری است؛ اگر داده شد باید به پروژه تعلق داشته باشد.
  let device:
    | { id: number; project_id: number; main_serial: string | null; part_number_1: string | null; part_number_2: string | null; project_name: string | null }
    | undefined;
  if (device_id) {
    device = db
      .prepare(
        `SELECT d.id, d.project_id, d.main_serial, d.part_number_1, d.part_number_2, p.name AS project_name
         FROM devices d LEFT JOIN projects p ON p.id = d.project_id WHERE d.id = ?`
      )
      .get(device_id) as typeof device;
    if (!device) {
      res.status(404).json({ error: 'تجهیز مقصد یافت نشد.' });
      return;
    }
    if (device.project_id !== project_id) {
      res.status(400).json({ error: 'این تجهیز به پروژه‌ی انتخاب‌شده تعلق ندارد؛ پروژه و تجهیز باید هم‌خوان باشند.' });
      return;
    }
  } else if (!create_per_row) {
    res.status(400).json({
      error: 'تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید — آپلود بی‌مقصد مجاز نیست.',
    });
    return;
  }

  if (!file || file.data.length === 0) {
    res.status(400).json({ error: 'فایل اکسل با نام «file» ارسال نشده است.' });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.data, { type: 'buffer' });
  } catch {
    res.status(400).json({ error: 'فایل اکسل قابل خواندن نیست (فرمت xlsx/xls معتبر باشد).' });
    return;
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    res.status(400).json({ error: 'فایل اکسل هیچ شیتی ندارد.' });
    return;
  }

  const rows = sheetToColumnRows(sheet);

  // --- پیدا کردن ردیف هدرِ پارت‌نامبر (خودکار، معمولاً ردیف ۳) ---
  let pnRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && looksLikePartNumberRow(rows[i])) {
      pnRowIndex = i;
      break;
    }
  }
  if (pnRowIndex === -1 || pnRowIndex < 2 || rows.length < pnRowIndex + 2) {
    res.status(400).json({
      error: 'قالب فایل شناسایی نشد: باید ردیفی از پارت‌نامبرها (مثل ردیف ۳) و پس از آن حداقل یک ردیف سریال وجود داشته باشد.',
    });
    return;
  }

  const headerRow = rows[pnRowIndex - 2] ?? {}; // عنوان قطعه (معمولاً ردیف ۱)
  const descRow = rows[pnRowIndex - 1] ?? {};   // توضیحات/مدل  (معمولاً ردیف ۲)
  const pnRow = rows[pnRowIndex];

  // --- ستون‌های قطعه از ردیف پارت‌نامبر ---
  // اگر یک پارت‌نامبر در چند ستون تکرار شده باشد (مثلاً دو منبع تغذیه)،
  // همه‌ی توضیحات/عنوان‌های دیدده‌شده جمع می‌شود تا «یکی» قطعه‌ی مرجع ساخته شود
  // و توضیحات برای انتخاب کاربر در گزارش برگردد (ضدتکراری‌سازی).
  const devicePn = device
    ? normalizePartNumber(device.part_number_1 || device.part_number_2 || '')
    : '';
  const columns: ColumnMatch[] = [];
  const byPn = new Map<string, ColumnMatch>();
  const duplicateColToPn = new Map<string, string>();
  for (const [letter, value] of Object.entries(pnRow)) {
    if (letter === 'A') continue;
    const pn = normalizePartNumber(value);
    if (!pn) continue;
    const title = String(headerRow[letter] ?? '').trim() || pn;
    const desc = String(descRow[letter] ?? '').trim();
    const existing = byPn.get(pn);
    if (existing) {
      // ستون تکراری با پارت‌نامبر موجود → فقط توضیحات/عنوان متمایز را جمع کن
      if (desc && !existing.descVariants.includes(desc)) existing.descVariants.push(desc);
      if (title && !existing.titleVariants.includes(title)) existing.titleVariants.push(title);
      // نقشه‌ی ستون تکراری به همان قطعه‌ی مرجع
      duplicateColToPn.set(letter, pn);
      continue;
    }
    const col: ColumnMatch = {
      colLetter: letter,
      partNumber: pn,
      title,
      desc,
      partIds: [],
      isNew: false,
      titleVariants: [title],
      descVariants: desc ? [desc] : [],
      perDeviceCounter: new Map(),
    };
    byPn.set(pn, col);
    columns.push(col);
    duplicateColToPn.set(letter, pn);
  }

  if (columns.length === 0) {
    res.status(400).json({ error: 'هیچ پارت‌نامبری در ردیف هدر پیدا نشد.' });
    return;
  }

  // --- ردیف‌های سریال (پس از ردیف پارت‌نامبر) ---
  // برای ستون‌های تکراری (هم‌پارت‌نامبر)، سریال‌ها به ترتیب پیدا شدن به قطعه‌ی مرجع
  // وصل می‌شوند و اگر رکورد بیشتری لازم شد، قطعه‌ی جدید ساخته می‌شود.
  const serialRows: { rowNumber: number; serials: SerialCell[] }[] = [];
  for (let i = pnRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const serials: SerialCell[] = [];
    for (const c of columns) {
      const v = r[c.colLetter];
      if (v) serials.push({ colLetter: c.colLetter, value: v });
      // ستون‌های تکراری همیشه بعد از مرجع خودشان پردازش می‌شوند — ترتیب حفظ می‌شود
    }
    if (serials.length > 0) serialRows.push({ rowNumber: i + 1, serials });
  }

  if (serialRows.length === 0) {
    res.status(400).json({ error: 'هیچ سریالی پس از ردیف پارت‌نامبر پیدا نشد.' });
    return;
  }

  // --- تطبیق پارت‌نامبرها ---
  // ۱) داخل دستگاه هدف؛ ۲) کل سامانه؛ ۳) خودِ دستگاه (main_serial)؛ ۴) ساخت قطعه‌ی جدید
  const partsOfDevice = device_id
    ? (db.prepare(
        `SELECT id, part_number_1, part_number_2 FROM parts WHERE device_id = ? ORDER BY id`
      ).all(device_id) as { id: number; part_number_1: string | null; part_number_2: string | null }[])
    : [];

  let matchedColumns = 0;
  let createdColumns = 0;
  const unmatched: string[] = [];

  for (const c of columns) {
    // ستونِ پارت‌نامبرِ خودِ دستگاه → main_serial
    if (devicePn && device_id && c.partNumber === devicePn) {
      c.partIds = [-device_id]; // علامت منفی = سریال اصلی دستگاه
      matchedColumns++;
      continue;
    }
    // قطعات همین دستگاه
    const own = partsOfDevice.filter(
      (p) =>
        normalizePartNumber(p.part_number_1 || '') === c.partNumber ||
        normalizePartNumber(p.part_number_2 || '') === c.partNumber
    );
    if (own.length > 0) {
      c.partIds = own.map((p) => p.id);
      matchedColumns++;
      continue;
    }
    // کل سامانه — فقط در حالت دستگاه واحد؛ در حالت چنددستگاهه هر ردیفِ هر دستگاه
    // همیشه قطعه‌ی مستقل خودش را می‌سازد (ضدتکراری روی (پارت‌نامبر، دستگاه)).
    if (!create_per_row) {
      const anywhere = db.prepare(
        `SELECT id FROM parts
         WHERE UPPER(REPLACE(COALESCE(part_number_1,''), ' ', '')) = ?
            OR UPPER(REPLACE(COALESCE(part_number_2,''), ' ', '')) = ?
         ORDER BY id`
      ).all(c.partNumber, c.partNumber) as { id: number }[];
      if (anywhere.length > 0) {
        c.partIds = anywhere.map((p) => p.id);
        matchedColumns++;
        continue;
      }
    }
    // ساخته خواهد شد
    c.isNew = true;
    createdColumns++;
  }

  // --- آماده‌سازی دستورات ---
  type Applied =
    | { kind: 'part'; partId: number; serial: string; title: string }
    | { kind: 'device'; serial: string }
    | { kind: 'new-part'; title: string; pn: string; serial: string };
  const applied: Applied[] = [];
  const skipped: { row: number; column: string; partNumber: string; reason: string }[] = [];

  const updatePartStmt = db.prepare(`UPDATE parts SET part_serial_number = ? WHERE id = ?`);
  let createdDevices = 0;
  const updateDeviceStmt = db.prepare(`UPDATE devices SET main_serial = ? WHERE id = ?`);
  const insertPartStmt = db.prepare(
    `INSERT INTO parts (device_id, title, tech_specs, part_number_1, part_serial_number, status, sold_at_jalali, sold_at_gregorian, created_by)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  );

  const todayJ = (() => {
    const j = jalaali.toJalaali(new Date());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  })();
  const todayG = new Date().toISOString().slice(0, 10);

  // در حالت «هر ردیف = یک دستگاه»: ردیفِ دارای سریال دستگاه، دستگاه جدید می‌سازد.
  // نوع/برند/مدل دستگاه جدید از دستگاه هدف (در صورت انتخاب) یا اولین دستگاه هم‌نوع در پروژه
  // یا اولین نوع ثبت‌شده در سامانه کپی می‌شود (device_type_id در اسکیما NOT NULL است).
  let deviceTemplate: { device_type_id: number; device_model_id: number | null; brand_id: number | null } | undefined;
  if (create_per_row) {
    deviceTemplate = device_id
      ? (db.prepare(
          `SELECT device_type_id, device_model_id, brand_id FROM devices WHERE id = ?`
        ).get(device_id) as typeof deviceTemplate)
      : (db.prepare(
          `SELECT device_type_id, device_model_id, brand_id FROM devices WHERE project_id = ? ORDER BY id LIMIT 1`
        ).get(project_id) as typeof deviceTemplate);
    if (!deviceTemplate) {
      const firstType = db.prepare(`SELECT id FROM device_types ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
      if (!firstType) {
        res.status(400).json({ error: 'برای ساخت خودکار دستگاه، ابتدا حداقل یک «نوع تجهیز» در مدیریت لیست‌ها ثبت کنید.' });
        return;
      }
      deviceTemplate = { device_type_id: firstType.id, device_model_id: null, brand_id: null };
    }
  }
  const ensureDeviceForSerial = create_per_row
    ? db.prepare(
        `INSERT INTO devices (project_id, main_serial, device_type_id, device_model_id, brand_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`
      )
    : null;
  const deviceByRow = new Map<number, number>(); // rowNumber → device_id
  // ردیف‌های ادامه‌ای (بدون ستون سریال دستگاه) در فهرست انبار «چرخشی» هستند:
  // هر ردیفِ ادامه‌ای، قطعه‌ی دوم/سومِ همان نوع روی دستگاه n-اُم است.
  // پس با شمارنده‌ی چرخشی بین دستگاه‌های شناخته‌شده توزیع می‌شوند.
  const knownDeviceIds: number[] = [];
  let contRowCounter = 0;

  runTransaction(db, () => {
    for (const row of serialRows) {
      // --- تعیین دستگاه مقصد این ردیف ---
      let rowDeviceId: number = device_id ?? 0;
      if (create_per_row) {
        // ستونِ «سریال دستگاه» = ستونی که پارت‌نامبرش مال خود دستگاه است (Case در اکسل نمونه)
        // یا اولین ستون داده‌ای وقتی پارت‌نامبرِ دستگاه تعریف نشده.
        const deviceCol = devicePn
          ? columns.find((c) => c.partNumber === devicePn)
          : columns.find((c) => c.colLetter === 'B');
        const hasDeviceSerial = !!deviceCol && row.serials.some((s) => s.colLetter === deviceCol.colLetter);
        if (hasDeviceSerial) {
          const devSerial = row.serials.find((s) => s.colLetter === deviceCol!.colLetter)!.value;
          // ضدتکرار: اگر دستگاهی با همین main_serial در همین پروژه هست، همان استفاده می‌شود
          const existing = db
            .prepare(`SELECT id FROM devices WHERE project_id = ? AND main_serial = ?`)
            .get(project_id, devSerial) as { id: number } | undefined;
          rowDeviceId =
            existing?.id ??
            (ensureDeviceForSerial!.run(
              project_id,
              devSerial,
              deviceTemplate!.device_type_id,
              deviceTemplate!.device_model_id,
              deviceTemplate!.brand_id,
              req.user!.sub
            ).lastInsertRowid as number);
          createdDevices++;
        } else {
          // ردیف ادامه‌ای: توزیع چرخشی روی دستگاه‌های شناخته‌شده (الگوی فهرست انبار:
          // ردیف‌های بعد از هر دستگاه، قطعات اضافه‌ی همان دستگاه به ترتیب هستند).
          if (knownDeviceIds.length === 0) {
            if (device_id) knownDeviceIds.push(device_id);
            else {
              const first = db
                .prepare(`SELECT id FROM devices WHERE project_id = ? ORDER BY id LIMIT 1`)
                .get(project_id) as { id: number } | undefined;
              if (first) knownDeviceIds.push(first.id);
              else {
                rowDeviceId = ensureDeviceForSerial!.run(
                  project_id,
                  null,
                  deviceTemplate!.device_type_id,
                  deviceTemplate!.device_model_id,
                  deviceTemplate!.brand_id,
                  req.user!.sub
                ).lastInsertRowid as number;
                knownDeviceIds.push(rowDeviceId);
              }
            }
          }
          rowDeviceId = knownDeviceIds[contRowCounter % knownDeviceIds.length];
          contRowCounter++;
        }
        if (hasDeviceSerial) {
          // دستگاه جدید سریال‌دار → در چرخه‌ی توزیع قرار می‌گیرد
          if (!knownDeviceIds.includes(rowDeviceId)) knownDeviceIds.push(rowDeviceId);
          contRowCounter = 0; // پس از هر دستگاه، شمارنده از ابتدای چرخه شروع می‌شود
        }
        deviceByRow.set(row.rowNumber, rowDeviceId);
      }

      for (const s of row.serials) {
        const col = columns.find((c) => c.colLetter === s.colLetter);
        if (!col) continue;
        const targetDevice = deviceByRow.get(row.rowNumber) || device_id;

        // ستونِ پارت‌نامبر خود دستگاه → main_serial دستگاه مقصدِ همان ردیف
        if (devicePn && col.partNumber === devicePn) {
          updateDeviceStmt.run(s.value, rowDeviceId);
          applied.push({ kind: 'device', serial: s.value });
          continue;
        }

        // شمارنده‌ی مصرف رکوردها به تفکیک دستگاه (ضدتکراری: هر دستگاه قطعات خودش).
        // در حالت چنددستگاهه، پارت‌نامبر تکراری در ردیف‌های (دستگاه‌های) مختلف
        // یعنی «قطعات جداگانه» — همیشه رکورد جدید ساخته می‌شود تا هر دستگاه
        // قطعه‌ی مستقل خودش را داشته باشد و در فهرست قطعات قابل ردیابی باشد.
        if (create_per_row) {
          const mergedDesc = col.descVariants.length > 0 ? col.descVariants.join(' | ') : null;
          const info = insertPartStmt.run(
            rowDeviceId,
            col.titleVariants.length > 1 ? col.titleVariants.join(' | ') : col.title,
            mergedDesc,
            col.partNumber,
            s.value,
            todayJ,
            todayG,
            req.user!.sub
          );
          col.partIds.push(info.lastInsertRowid as number);
          applied.push({ kind: 'new-part', title: col.title, pn: col.partNumber, serial: s.value });
          continue;
        }

        // حالت دستگاه هدف واحد: اولین سریالِ ستون به قطعه‌ی موجود (اگر هست) وصل می‌شود؛
        // سریال‌های بعدی قطعه‌ی جدید می‌سازند (چند عدد از یک قطعه روی همان دستگاه).
        const used = col.perDeviceCounter.get(rowDeviceId) ?? 0;
        const target = col.partIds[used];
        col.perDeviceCounter.set(rowDeviceId, used + 1);

        if (target === undefined) {
          // سریال‌های مازاد یک پارت‌نامبر موجود → قطعه‌ی جدید روی دستگاه مقصد همان ردیف
          const mergedDesc = col.descVariants.length > 0 ? col.descVariants.join(' | ') : null;
          const info = insertPartStmt.run(
            targetDevice!,
            col.titleVariants.length > 1 ? col.titleVariants.join(' | ') : col.title,
            mergedDesc,
            col.partNumber,
            s.value,
            todayJ,
            todayG,
            req.user!.sub
          );
          col.partIds.push(info.lastInsertRowid as number);
          applied.push({ kind: 'new-part', title: col.title, pn: col.partNumber, serial: s.value });
          continue;
        }

        if (target < 0) {
          updateDeviceStmt.run(s.value, rowDeviceId);
          applied.push({ kind: 'device', serial: s.value });
          continue;
        }

        updatePartStmt.run(s.value, target);
        applied.push({ kind: 'part', partId: target, serial: s.value, title: col.title });
      }
    }
  });

  // --- گزارش توضیحات چندگانه (برای نمایش به کاربر) ---
  const descConflicts = columns
    .filter((c) => c.descVariants.length > 1)
    .map((c) => ({
      partNumber: c.partNumber,
      title: c.titleVariants.join(' | '),
      descriptions: c.descVariants,
      note: 'برای این پارت‌نامبر چند توضیح متفاوت در فایل بود؛ همگی ذخیره شدند — در فهرست قطعات توضیح درست را انتخاب/ویرایش کنید.',
    }));

  res.json({
    ok: true,
    summary: {
      file: file.filename,
      projectId: project_id,
      projectName: device?.project_name ?? null,
      deviceId: device_id ?? null,
      deviceMainSerial: device?.main_serial ?? null,
      devicesCreated: createdDevices,
      columnsTotal: columns.length,
      columnsMatched: matchedColumns,
      columnsCreated: createdColumns,
      serialRows: serialRows.length,
      partsUpdated: applied.filter((a) => a.kind === 'part').length,
      partsCreated: applied.filter((a) => a.kind === 'new-part').length,
      deviceSerialUpdated: applied.some((a) => a.kind === 'device'),
    },
    descConflicts,
    unmatchedPartNumbers: unmatched,
    skipped: skipped.slice(0, 100),
  });
}

export default router;
