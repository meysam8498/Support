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

  // --- اعتبارسنجی مقصد: پروژه و دستگاه الزامی ---
  const targetSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    device_id: z.coerce.number().int().positive(),
  });
  const parsedTarget = targetSchema.safeParse(fields);
  if (!parsedTarget.success) {
    res.status(400).json({
      error: 'انتخاب پروژه و تجهیز مقصد الزامی است — آپلود بدون مقصد مجاز نیست.',
      detail: parsedTarget.error.flatten(),
    });
    return;
  }
  const { project_id, device_id } = parsedTarget.data;

  const db = getDb();
  const device = db
    .prepare(
      `SELECT d.id, d.project_id, d.main_serial, d.part_number_1, d.part_number_2, p.name AS project_name
       FROM devices d LEFT JOIN projects p ON p.id = d.project_id WHERE d.id = ?`
    )
    .get(device_id) as
    | { id: number; project_id: number; main_serial: string | null; part_number_1: string | null; part_number_2: string | null; project_name: string | null }
    | undefined;

  if (!device) {
    res.status(404).json({ error: 'تجهیز مقصد یافت نشد.' });
    return;
  }
  if (device.project_id !== project_id) {
    res.status(400).json({ error: 'این تجهیز به پروژه‌ی انتخاب‌شده تعلق ندارد؛ پروژه و تجهیز باید هم‌خوان باشند.' });
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
  const devicePn = normalizePartNumber(device.part_number_1 || device.part_number_2 || '');
  const columns: ColumnMatch[] = [];
  for (const [letter, value] of Object.entries(pnRow)) {
    if (letter === 'A') continue;
    const pn = normalizePartNumber(value);
    if (!pn) continue;
    columns.push({
      colLetter: letter,
      partNumber: pn,
      title: String(headerRow[letter] ?? '').trim() || pn,
      desc: String(descRow[letter] ?? '').trim(),
      partIds: [],
      isNew: false,
    });
  }

  if (columns.length === 0) {
    res.status(400).json({ error: 'هیچ پارت‌نامبری در ردیف هدر پیدا نشد.' });
    return;
  }

  // --- ردیف‌های سریال (پس از ردیف پارت‌نامبر) ---
  const serialRows: { rowNumber: number; serials: SerialCell[] }[] = [];
  for (let i = pnRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const serials: SerialCell[] = [];
    for (const c of columns) {
      const v = r[c.colLetter];
      if (v) serials.push({ colLetter: c.colLetter, value: v });
    }
    if (serials.length > 0) serialRows.push({ rowNumber: i + 1, serials });
  }

  if (serialRows.length === 0) {
    res.status(400).json({ error: 'هیچ سریالی پس از ردیف پارت‌نامبر پیدا نشد.' });
    return;
  }

  // --- تطبیق پارت‌نامبرها ---
  // ۱) داخل دستگاه هدف؛ ۲) کل سامانه؛ ۳) خودِ دستگاه (main_serial)؛ ۴) ساخت قطعه‌ی جدید
  const partsOfDevice = db.prepare(
    `SELECT id, part_number_1, part_number_2 FROM parts WHERE device_id = ? ORDER BY id`
  ).all(device_id) as { id: number; part_number_1: string | null; part_number_2: string | null }[];

  let matchedColumns = 0;
  let createdColumns = 0;
  const unmatched: string[] = [];

  for (const c of columns) {
    // ستونِ پارت‌نامبرِ خودِ دستگاه → main_serial
    if (devicePn && c.partNumber === devicePn) {
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
    // کل سامانه (برای وصل‌کردن سریال به رکوردهای موجود در دستگاه‌های دیگر)
    const anywhere = db.prepare(
      `SELECT id FROM parts
       WHERE UPPER(REPLACE(COALESCE(part_number_1,''), ' ', '')) = ?
          OR UPPER(REPLACE(COALESCE(part_number_2,''), ' ', '')) = ?
       ORDER BY id`
    ).all(c.partNumber, c.partNumber) as { id: number }[];
    if (anywhere.length > 0) {
      c.partIds = anywhere.map((p) => p.id);
      matchedColumns++;
    } else {
      // ساخته خواهد شد
      c.isNew = true;
      createdColumns++;
    }
  }

  // --- آماده‌سازی دستورات ---
  type Applied =
    | { kind: 'part'; partId: number; serial: string; title: string }
    | { kind: 'device'; serial: string }
    | { kind: 'new-part'; title: string; pn: string; serial: string };
  const applied: Applied[] = [];
  const skipped: { row: number; column: string; partNumber: string; reason: string }[] = [];

  const perColumnCounter = new Map<string, number>();
  const updatePartStmt = db.prepare(`UPDATE parts SET part_serial_number = ? WHERE id = ?`);
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

  runTransaction(db, () => {
    for (const row of serialRows) {
      for (const s of row.serials) {
        const col = columns.find((c) => c.colLetter === s.colLetter);
        if (!col) continue;

        // قطعه‌ی جدید: در اولین برخورد، رکورد روی دستگاه هدف ساخته می‌شود
        if (col.isNew && col.partIds.length === 0) {
          const info = insertPartStmt.run(
            device_id,
            col.title,
            col.desc || null,
            col.partNumber,
            s.value,
            todayJ,
            todayG,
            req.user!.sub
          );
          const newId = info.lastInsertRowid as number;
          col.partIds.push(newId);
          col.isNew = false;
          applied.push({ kind: 'new-part', title: col.title, pn: col.partNumber, serial: s.value });
          continue;
        }

        const target = col.partIds[perColumnCounter.get(s.colLetter) ?? 0];
        perColumnCounter.set(s.colLetter, (perColumnCounter.get(s.colLetter) ?? 0) + 1);

        if (target === undefined) {
          // سریال‌های مازاد یک پارت‌نامبر موجود → قطعه‌ی جدید روی دستگاه هدف
          const info = insertPartStmt.run(
            device_id,
            col.title,
            col.desc || null,
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
          updateDeviceStmt.run(s.value, device_id);
          applied.push({ kind: 'device', serial: s.value });
          continue;
        }

        updatePartStmt.run(s.value, target);
        applied.push({ kind: 'part', partId: target, serial: s.value, title: col.title });
      }
    }
  });

  res.json({
    ok: true,
    summary: {
      file: file.filename,
      projectId: project_id,
      projectName: device.project_name,
      deviceId: device_id,
      deviceMainSerial: device.main_serial,
      columnsTotal: columns.length,
      columnsMatched: matchedColumns,
      columnsCreated: createdColumns,
      serialRows: serialRows.length,
      partsUpdated: applied.filter((a) => a.kind === 'part').length,
      partsCreated: applied.filter((a) => a.kind === 'new-part').length,
      deviceSerialUpdated: applied.some((a) => a.kind === 'device'),
    },
    unmatchedPartNumbers: unmatched,
    skipped: skipped.slice(0, 100),
  });
}

export default router;
