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
// نقاط انتهایی:
//   POST /api/serial-import          — آپلود واقعی (ثبت در پایگاه‌داده)
//   POST /api/serial-import/preview  — پیش‌نمایش خشک (dry-run): همان منطق
//       تجزیه/تطبیق را اجرا می‌کند ولی «هیچ» تغییری در پایگاه‌داده نمی‌دهد؛
//       خروجی: ستون‌های تطبیق‌یافته/جدید، اقدام‌های ردیف‌به‌ردیف که اجرا
//       خواهند شد و هشدارها.
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
import { syncPartsToCatalog } from './partCatalog.js';
import { findDuplicateSerial } from './parts.js';

const router = Router();

interface ColumnMatch {
  colLetter: string;
  partNumber: string;
  title: string;
  desc: string;
  partIds: number[]; // قطعات موجود با این پارت‌نامبر (به ترتیب id)؛ مقدار منفی = سریال اصلی دستگاه
  isNew: boolean;    // در این import ساخته می‌شود
  matchedFrom: 'device' | 'system' | null; // محل تطبیق (برای پیش‌نمایش)
  titleVariants: string[]; // عنوان‌های مختلف دیدده‌شده برای همین پارت‌نامبر
  descVariants: string[];  // توضیحات مختلف دیدده‌شده (برای انتخاب کاربر)
  perDeviceCounter: Map<number, number>; // مصرف رکوردها به تفکیک دستگاه مقصد
}

interface SerialCell {
  colLetter: string;
  value: string;
}

interface TargetDevice {
  id: number;
  project_id: number;
  main_serial: string | null;
  part_number_1: string | null;
  part_number_2: string | null;
  project_name: string | null;
}

interface DescConflict {
  partNumber: string;
  title: string;
  descriptions: string[];
  note: string;
}

interface DeviceTemplate {
  device_type_id: number;
  device_model_id: number | null;
  brand_id: number | null;
}

// ---------- قالب ردیف‌محور (نسخه‌ی ۲): هر ردیف = یک قطعه ----------
interface RowTemplateRow {
  deviceSerial: string; // سریال تجهیز مقصد (می‌تواند خالی باشد اگر device_id داده شده)
  kind: string;         // نوع قطعه (اختیاری)
  title: string;        // عنوان قطعه
  partNumber: string;   // پارت‌نامبر (کلید تطبیق)
  partSerial: string;   // سریال قطعه (ستون اصلی)
  specs: string;        // مشخصات فنی (اختیاری)
}

interface RowTemplateData {
  rows: RowTemplateRow[];
}

/** نتیجه‌ی مشترک تجزیه‌ی فایل — مبنای هم «پیش‌نمایش خشک» و هم «ثبت واقعی» */
interface Analysis {
  file: { filename: string; data: Buffer };
  project_id: number;
  device_id: number | undefined;
  create_per_row: boolean;
  device: TargetDevice | undefined;
  devicePn: string;
  columns: ColumnMatch[];
  serialRows: { rowNumber: number; serials: SerialCell[] }[];
  matchedColumns: number;
  createdColumns: number;
  unmatched: string[];
  descConflicts: DescConflict[];
  deviceTemplate: DeviceTemplate | undefined;
  rowTemplate: RowTemplateData | null; // قالب ردیف‌محور در صورت شناسایی
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

// POST /api/serial-import/preview — پیش‌نمایش خشک آپلود (فقط admin؛ بدون هیچ تغییری در DB)
router.post('/preview', requireRole('admin'), (req: Request, res: Response) => {
  collectBody(req, res, (body, contentType) => {
    try {
      handlePreview(body, contentType, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'خطا در پردازش فایل.', detail: (err as Error).message });
      }
    }
  });
});

// ------------------------------------------------------------------
// ورود بدون فایل — چسباندن مستقیم لیست از اکسل
// ------------------------------------------------------------------
/**
 * متن چندردیفی چسبانده‌شده را به rows به شکل Record<colLetter, value> تجزیه
 * می‌کند (همان شکلی که sheetToColumnRows از اکسل می‌سازد) تا کل منطق
 * ردیف‌محور موجود (parseRowTemplate + preview + upload) بدون تغییر استفاده شود.
 * جداکننده: Tab (اکسل) یا | یا ؛ — خودکار تشخیص داده می‌شود.
 */
function textToColumnRows(text: string): Record<string, string>[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  const first = lines[0];
  let delim = '\t';
  const pipes = (first.match(/\|/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  if (!first.includes('\t')) {
    if (pipes >= 2 && pipes >= semis) delim = '|';
    else if (semis >= 2) delim = ';';
  }

  return lines.map((line) => {
    const obj: Record<string, string> = {};
    line.split(delim).forEach((cell, i) => {
      const v = cell.trim().replace(/^"|"$/g, '');
      if (v !== '') obj[colLetter(i + 1)] = v;
    });
    return obj;
  });
}

/** بدنه‌ی JSON مسیر text را اعتبارسنجی و Analysis می‌سازد */
function analyzeTextPayload(req: Request, res: Response): Analysis | null {
  const schema = z.object({
    text: z.string().min(1).max(200_000),
    project_id: z.coerce.number().int().positive(),
    device_id: z.coerce.number().int().positive().optional(),
    create_per_row: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ورودی نامعتبر است — متن و پروژه‌ی مقصد الزامی است.', detail: parsed.error.flatten() });
    return null;
  }
  const { text, project_id, device_id, create_per_row } = parsed.data;

  const db = getDb();
  let device: TargetDevice | undefined;
  if (device_id) {
    device = db.prepare(
      `SELECT d.id, d.project_id, d.main_serial, d.part_number_1, d.part_number_2, p.name AS project_name
       FROM devices d LEFT JOIN projects p ON p.id = d.project_id WHERE d.id = ?`
    ).get(device_id) as TargetDevice | undefined;
    if (!device) { res.status(404).json({ error: 'تجهیز مقصد یافت نشد.' }); return null; }
    if (device.project_id !== project_id) { res.status(400).json({ error: 'تجهیز به پروژه‌ی انتخاب‌شده تعلق ندارد.' }); return null; }
  }

  const rows = textToColumnRows(text);
  if (rows.length === 0) { res.status(400).json({ error: 'متن خالی است — لیست را از اکسل کپی و اینجا بچسبانید.' }); return null; }

  const rowTemplate = parseRowTemplate(rows);
  if (!rowTemplate) {
    res.status(400).json({
      error: 'متن چسبانده‌شده قالب ردیف‌محور نیست — هر ردیف باید حداقل پارت‌نامبر و سریال قطعه داشته باشد (سرستون: پارت‌نامبر، سریال قطعه، …).',
    });
    return null;
  }

  return {
    file: { filename: 'clipboard', data: Buffer.from(text, 'utf8') },
    project_id,
    device_id,
    create_per_row,
    device,
    devicePn: '',
    columns: [],
    serialRows: [],
    matchedColumns: 0,
    createdColumns: 0,
    unmatched: [],
    descConflicts: [],
    deviceTemplate: undefined,
    rowTemplate,
  };
}

// POST /api/serial-import/preview-text — پیش‌نمایش خشک متن چسبانده‌شده (فقط admin)
router.post('/preview-text', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const analysis = analyzeTextPayload(req, res);
    if (!analysis) return;
    res.json({ ok: true, preview: buildRowTemplatePreview(analysis) });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'خطا در تحلیل متن.', detail: (err as Error).message });
  }
});

// POST /api/serial-import/text — ثبت واقعی متن چسبانده‌شده (فقط admin)
router.post('/text', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const analysis = analyzeTextPayload(req, res);
    if (!analysis) return;
    handleRowTemplateUpload(analysis, req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'خطا در ثبت متن.', detail: (err as Error).message });
  }
});

// POST /api/serial-import — آپلود اکسل مقید به پروژه/دستگاه (فقط admin)
router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  collectBody(req, res, (body, contentType) => {
    try {
      handleUpload(body, contentType, req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'خطا در پردازش فایل.', detail: (err as Error).message });
      }
    }
  });
});

/** جمع‌آوری بدنه‌ی multipart با سقف ۱۰ مگابایت — مشترک بین preview و upload */
function collectBody(req: Request, res: Response, handle: (body: Buffer, contentType: string) => void): void {
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
    handle(Buffer.concat(chunks), String(req.headers['content-type'] || ''));
  });
}

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

/**
 * تجزیه‌ی کامل فایل و تطبیق پارت‌نامبرها — بدون هیچ نوشتنی در پایگاه‌داده.
 * در صورت خطا پاسخ 4xx می‌فرستد و null برمی‌گرداند.
 */
function analyzeUpload(body: Buffer, contentType: string, res: Response): Analysis | null {
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
    return null;
  }
  const { project_id, device_id, create_per_row } = parsedTarget.data;

  const db = getDb();
  let deferredTargetCheck = false;

  // حالت «هر ردیف = یک دستگاه»: device_id اختیاری است؛ اگر داده شد باید به پروژه تعلق داشته باشد.
  let device: TargetDevice | undefined;
  if (device_id) {
    device = db
      .prepare(
        `SELECT d.id, d.project_id, d.main_serial, d.part_number_1, d.part_number_2, p.name AS project_name
         FROM devices d LEFT JOIN projects p ON p.id = d.project_id WHERE d.id = ?`
      )
      .get(device_id) as TargetDevice | undefined;
    if (!device) {
      res.status(404).json({ error: 'تجهیز مقصد یافت نشد.' });
      return null;
    }
    if (device.project_id !== project_id) {
      res.status(400).json({ error: 'این تجهیز به پروژه‌ی انتخاب‌شده تعلق ندارد؛ پروژه و تجهیز باید هم‌خوان باشند.' });
      return null;
    }
  } else if (!create_per_row) {
    // در قالب ردیف‌محور (نسخه‌ی ۲) سریال تجهیز داخل فایل است و انتخاب تجهیز لازم نیست؛
    // چک «مقصد الزامی» فقط بعد از رد شدن تشخیص قالب ردیف‌محور اعمال می‌شود.
    if (!file) {
      res.status(400).json({
        error: 'تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید — آپلود بی‌مقصد مجاز نیست.',
      });
      return null;
    }
    deferredTargetCheck = true;
  }

  if (!file || file.data.length === 0) {
    res.status(400).json({ error: 'فایل اکسل با نام «file» ارسال نشده است.' });
    return null;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.data, { type: 'buffer' });
  } catch {
    res.status(400).json({ error: 'فایل اکسل قابل خواندن نیست (فرمت xlsx/xls معتبر باشد).' });
    return null;
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    res.status(400).json({ error: 'فایل اکسل هیچ شیتی ندارد.' });
    return null;
  }

  const rows = sheetToColumnRows(sheet);

  // --- تشخیص قالب ردیف‌محور (نسخه‌ی ۲): هر ردیف = یک قطعه با سریال تجهیز مشخص ---
  // این قالب برای «یک سرور با چند قطعه» است: تفکیک صریح می‌گوید هر قطعه روی
  // کدام دستگاه نصب شده. اگر شناسایی شد، مسیر ستون‌محور قدیمی اجرا نمی‌شود.
  const rowTemplate = parseRowTemplate(rows);
  if (rowTemplate) {
    // قالب ردیف‌محور: چک تعویق‌شده‌ی مقصد دیگر لازم نیست — سریال تجهیز ستون صریح فایل است.
    void deferredTargetCheck;
    return {
      file,
      project_id,
      device_id,
      create_per_row,
      device,
      devicePn: '',
      columns: [],
      serialRows: [],
      matchedColumns: 0,
      createdColumns: 0,
      unmatched: [],
      descConflicts: [],
      deviceTemplate: undefined,
      rowTemplate,
    };
  }

  // --- پیدا کردن ردیف هدرِ پارت‌نامبر (خودکار، معمولاً ردیف ۳) ---
  let pnRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && looksLikePartNumberRow(rows[i])) {
      pnRowIndex = i;
      break;
    }
  }
  if (pnRowIndex === -1 || pnRowIndex < 2 || rows.length < pnRowIndex + 2) {
    // قالب قدیمی هم نبود؛ اگر چک مقصد تعویق شده بود، اکنون اعمال می‌شود
    if (deferredTargetCheck) {
      res.status(400).json({
        error: 'تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید — آپلود بی‌مقصد مجاز نیست.',
      });
      return null;
    }
    res.status(400).json({
      error: 'قالب فایل شناسایی نشد: باید ردیفی از پارت‌نامبرها (مثل ردیف ۳) و پس از آن حداقل یک ردیف سریال وجود داشته باشد.',
    });
    return null;
  }
  if (deferredTargetCheck) {
    res.status(400).json({
      error: 'تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید — آپلود بی‌مقصد مجاز نیست.',
    });
    return null;
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
      continue;
    }
    const col: ColumnMatch = {
      colLetter: letter,
      partNumber: pn,
      title,
      desc,
      partIds: [],
      isNew: false,
      matchedFrom: null,
      titleVariants: [title],
      descVariants: desc ? [desc] : [],
      perDeviceCounter: new Map(),
    };
    byPn.set(pn, col);
    columns.push(col);
  }

  if (columns.length === 0) {
    res.status(400).json({ error: 'هیچ پارت‌نامبری در ردیف هدر پیدا نشد.' });
    return null;
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
    return null;
  }

  // --- تطبیق پارت‌نامبرها ---
  // ۱) داخل دستگاه هدف؛ ۲) کل سامانه؛ ۳) خودِ دستگاه (main_serial)؛ ۴) ساخت قطعه‌ی جدید
  const partsOfDevice = device_id
    ? (db.prepare(
        `SELECT id, title, part_number_1, part_number_2 FROM parts WHERE device_id = ? ORDER BY id`
      ).all(device_id) as { id: number; title: string; part_number_1: string | null; part_number_2: string | null }[])
    : [];

  let matchedColumns = 0;
  let createdColumns = 0;
  const unmatched: string[] = [];

  for (const c of columns) {
    // ستونِ پارت‌نامبرِ خودِ دستگاه → main_serial
    if (devicePn && device_id && c.partNumber === devicePn) {
      c.partIds = [-device_id]; // علامت منفی = سریال اصلی دستگاه
      c.matchedFrom = 'device';
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
      c.matchedFrom = 'device';
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
        c.matchedFrom = 'system';
        matchedColumns++;
        continue;
      }
    }
    // ساخته خواهد شد
    c.isNew = true;
    createdColumns++;
  }

  // در حالت «هر ردیف = یک دستگاه»: نوع/برند دستگاه جدید از دستگاه هدف (در صورت انتخاب)
  // یا اولین دستگاه هم‌نوع در پروژه یا اولین نوع ثبت‌شده در سامانه کپی می‌شود
  // (device_type_id در اسکیما NOT NULL است).
  let deviceTemplate: DeviceTemplate | undefined;
  if (create_per_row) {
    deviceTemplate = device_id
      ? (db.prepare(
          `SELECT device_type_id, device_model_id, brand_id FROM devices WHERE id = ?`
        ).get(device_id) as DeviceTemplate | undefined)
      : (db.prepare(
          `SELECT device_type_id, device_model_id, brand_id FROM devices WHERE project_id = ? ORDER BY id LIMIT 1`
        ).get(project_id) as DeviceTemplate | undefined);
    if (!deviceTemplate) {
      const firstType = db.prepare(`SELECT id FROM device_types ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
      if (!firstType) {
        res.status(400).json({ error: 'برای ساخت خودکار دستگاه، ابتدا حداقل یک «نوع تجهیز» در مدیریت لیست‌ها ثبت کنید.' });
        return null;
      }
      deviceTemplate = { device_type_id: firstType.id, device_model_id: null, brand_id: null };
    }
  }

  // --- گزارش توضیحات چندگانه (برای نمایش به کاربر) ---
  const descConflicts: DescConflict[] = columns
    .filter((c) => c.descVariants.length > 1)
    .map((c) => ({
      partNumber: c.partNumber,
      title: c.titleVariants.join(' | '),
      descriptions: c.descVariants,
      note: 'برای این پارت‌نامبر چند توضیح متفاوت در فایل بود؛ همگی ذخیره شدند — در فهرست قطعات توضیح درست را انتخاب/ویرایش کنید.',
    }));

  return {
    file,
    project_id,
    device_id,
    create_per_row,
    device,
    devicePn,
    columns,
    serialRows,
    matchedColumns,
    createdColumns,
    unmatched,
    descConflicts,
    deviceTemplate,
    rowTemplate: null,
  };
}

type PreviewActionKind = 'update_part' | 'create_part' | 'set_main_serial';

interface PreviewAction {
  row: number;
  col: string;
  partNumber: string;
  serial: string;
  action: PreviewActionKind;
  target: string; // برچسب فارسی مقصد برای نمایش
}

const PREVIEW_ACTIONS_CAP = 300;

/** ساخت payload پیش‌نمایش خشک: شبیه‌سازی دقیق حلقه‌ی ثبت، بدون هیچ نوشتنی */
function buildPreview(analysis: Analysis): Record<string, unknown> {
  const db = getDb();
  const { project_id, device_id, create_per_row, device, devicePn, columns, serialRows } = analysis;

  // نقشه‌ی id → عنوان قطعه (برای نمایش مقصد اقدام‌ها)
  const titleMap = new Map<number, string>();
  for (const c of columns) {
    for (const id of c.partIds) {
      if (id > 0 && !titleMap.has(id)) {
        const row = db.prepare(`SELECT title FROM parts WHERE id = ?`).get(id) as { title: string } | undefined;
        if (row) titleMap.set(id, row.title);
      }
    }
  }

  const actions: PreviewAction[] = [];
  let truncated = false;
  const pushAction = (a: PreviewAction) => {
    if (actions.length < PREVIEW_ACTIONS_CAP) actions.push(a);
    else truncated = true;
  };

  let createdDevices = 0;
  let updatedParts = 0;
  let createdParts = 0;
  let mainSerialUpdates = 0;

  const projectRow = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(project_id) as
    | { name: string }
    | undefined;

  // برچسب ردیف‌ها برای حالت چنددستگاهه — دقیقاً مطابق منطق ثبت واقعی
  const known: string[] = [];
  let contRowCounter = 0;
  // دستگاه‌هایی که در همین پیش‌نمایش «ساخته خواهند شد» — برای ضدتکرار داخل فایل
  const inFileDevices = new Map<string, string>();
  let pseudoDeviceSeq = 0;
  const pseudoIds = new Map<string, number>(); // برچسب → id منفی نمایشی

  for (const row of serialRows) {
    let rowDeviceLabel = `تجهیز مقصد #${device_id ?? 0}`;
    if (create_per_row) {
      const deviceCol = devicePn
        ? columns.find((c) => c.partNumber === devicePn)
        : columns.find((c) => c.colLetter === 'B');
      const hasDeviceSerial = !!deviceCol && row.serials.some((s) => s.colLetter === deviceCol.colLetter);
      if (hasDeviceSerial) {
        const devSerial = row.serials.find((s) => s.colLetter === deviceCol!.colLetter)!.value;
        let label = inFileDevices.get(devSerial);
        if (!label) {
          const existing = db
            .prepare(`SELECT id FROM devices WHERE project_id = ? AND main_serial = ?`)
            .get(project_id, devSerial) as { id: number } | undefined;
          if (existing) {
            label = `دستگاه موجود #${existing.id}`;
          } else {
            createdDevices++;
            label = `دستگاه جدید (سریال ${devSerial})`;
            pseudoDeviceSeq++;
            pseudoIds.set(label, -pseudoDeviceSeq);
          }
          inFileDevices.set(devSerial, label);
        }
        rowDeviceLabel = label;
        if (!known.includes(label)) known.push(label);
        contRowCounter = 0; // پس از هر دستگاه سریال‌دار، شمارنده از ابتدای چرخه شروع می‌شود
      } else {
        // ردیف ادامه‌ای: توزیع چرخشی روی دستگاه‌های شناخته‌شده
        if (known.length === 0) {
          if (device_id) {
            known.push(`تجهیز مقصد #${device_id}`);
          } else {
            const first = db
              .prepare(`SELECT id FROM devices WHERE project_id = ? ORDER BY id LIMIT 1`)
              .get(project_id) as { id: number } | undefined;
            if (first) known.push(`دستگاه موجود #${first.id}`);
            else {
              createdDevices++;
              const label = 'دستگاه جدید (بدون سریال)';
              pseudoDeviceSeq++;
              pseudoIds.set(label, -pseudoDeviceSeq);
              known.push(label);
            }
          }
        }
        rowDeviceLabel = known[contRowCounter % known.length];
        contRowCounter++;
      }
    }

    for (const s of row.serials) {
      const col = columns.find((c) => c.colLetter === s.colLetter);
      if (!col) continue;

      // ستونِ پارت‌نامبر خود دستگاه → main_serial دستگاه مقصدِ همان ردیف
      if (devicePn && col.partNumber === devicePn) {
        mainSerialUpdates++;
        pushAction({ row: row.rowNumber, col: col.colLetter, partNumber: col.partNumber, serial: s.value, action: 'set_main_serial', target: rowDeviceLabel });
        continue;
      }

      if (create_per_row) {
        createdParts++;
        pushAction({ row: row.rowNumber, col: col.colLetter, partNumber: col.partNumber, serial: s.value, action: 'create_part', target: `${col.title} → ${rowDeviceLabel}` });
        continue;
      }

      // حالت دستگاه هدف واحد: اولین سریالِ ستون به قطعه‌ی موجود وصل می‌شود؛
      // سریال‌های بعدی قطعه‌ی جدید می‌سازند.
      const used = col.perDeviceCounter.get(device_id ?? 0) ?? 0;
      col.perDeviceCounter.set(device_id ?? 0, used + 1);
      const target = col.partIds[used];

      if (target === undefined) {
        createdParts++;
        pushAction({ row: row.rowNumber, col: col.colLetter, partNumber: col.partNumber, serial: s.value, action: 'create_part', target: `${col.title} → تجهیز مقصد` });
        continue;
      }
      if (target < 0) {
        mainSerialUpdates++;
        pushAction({ row: row.rowNumber, col: col.colLetter, partNumber: col.partNumber, serial: s.value, action: 'set_main_serial', target: `تجهیز مقصد #${device_id}` });
        continue;
      }
      updatedParts++;
      const t = titleMap.get(target);
      pushAction({ row: row.rowNumber, col: col.colLetter, partNumber: col.partNumber, serial: s.value, action: 'update_part', target: `قطعه #${target}${t ? ` «${t}»` : ''}` });
    }
  }

  const previewColumns = columns.map((c) => {
    const isDevicePn = !!devicePn && c.partNumber === devicePn;
    const positiveIds = [...new Set(c.partIds.filter((id) => id > 0))];
    return {
      colLetter: c.colLetter,
      partNumber: c.partNumber,
      title: c.title,
      desc: c.desc || null,
      status: (isDevicePn ? 'device_serial' : c.isNew ? 'new' : 'matched') as 'device_serial' | 'new' | 'matched',
      matchedFrom: c.matchedFrom,
      existingCount: isDevicePn ? 0 : positiveIds.length,
      partTitles: positiveIds.map((id) => titleMap.get(id)).filter((t): t is string => !!t),
    };
  });

  const warnings: string[] = [];
  if (!create_per_row && device && !devicePn) {
    warnings.push('پارت‌نامبر دستگاه مقصد در پروفایل تجهیز ثبت نشده است؛ هیچ ستونی به‌عنوان «سریال اصلی دستگاه» به‌روزرسانی نمی‌شود.');
  }
  if (create_per_row && createdDevices === 0) {
    warnings.push('در حالت چنددستگاهه هیچ دستگاه جدیدی ساخته نمی‌شود (همه‌ی ردیف‌ها به دستگاه‌های موجود نگاشت شدند).');
  }

  return {
    file: analysis.file.filename,
    projectId: project_id,
    projectName: device?.project_name ?? projectRow?.name ?? null,
    deviceId: device_id ?? null,
    mode: create_per_row ? ('per_row' as const) : ('single' as const),
    rowsDetected: serialRows.length,
    columnsTotal: columns.length,
    columnsMatched: analysis.matchedColumns,
    columnsCreated: analysis.createdColumns,
    willUpdateParts: updatedParts,
    willCreateParts: createdParts,
    willCreateDevices: createdDevices,
    willUpdateMainSerial: mainSerialUpdates > 0,
    columns: previewColumns,
    actions,
    actionsTruncated: truncated,
    actionsCap: PREVIEW_ACTIONS_CAP,
    descConflicts: analysis.descConflicts,
    warnings,
  };
}

// POST /api/serial-import/preview — سازنده‌ی پاسخ پیش‌نمایش
function handlePreview(body: Buffer, contentType: string, res: Response): void {
  const analysis = analyzeUpload(body, contentType, res);
  if (!analysis) return;
  if (analysis.rowTemplate) {
    res.json({ ok: true, preview: buildRowTemplatePreview(analysis) });
    return;
  }
  res.json({ ok: true, preview: buildPreview(analysis) });
}

// ---------- پیش‌نمایش قالب ردیف‌محور ----------
function buildRowTemplatePreview(analysis: Analysis): Record<string, unknown> {
  const db = getDb();
  const rt = analysis.rowTemplate!;
  const { project_id, device_id } = analysis;

  const actions: PreviewAction[] = [];
  const warnings: string[] = [];
  const deviceCache = new Map<string, { id: number; exists: boolean }>();
  let updatedParts = 0;
  let createdParts = 0;
  let mainSerialUpdates = 0;
  let missingSerialRows = 0;
  let skippedPreview = 0;

  // --- تطبیق اسلاتی: (پارت‌نامبر، دستگاه) → فهرست قطعات موجود به‌ترتیب id ---
  // چند قطعه‌ی هم‌پارت‌نامبر روی یک دستگاه (مثل ۴ RAM یک سرور) به‌ترتیب اسلات
  // مصرف می‌شوند؛ ورود مجدد خروجیِ همین سامانه هیچ دوباره‌سازی نمی‌کند.
  const slotIndex = new Map<string, { ids: number[]; used: number }>();
  const slotKey = (pn: string, devId: number) => `${pn}#${devId}`;
  const takeSlot = (pn: string, devId: number): number | undefined => {
    const key = slotKey(pn, devId);
    let slot = slotIndex.get(key);
    if (!slot) {
      const ids = (
        db.prepare(
          `SELECT id FROM parts
           WHERE device_id = ?
             AND (UPPER(REPLACE(COALESCE(part_number_1,''), ' ', '')) = ?
                  OR UPPER(REPLACE(COALESCE(part_number_2,''), ' ', '')) = ?)
           ORDER BY id`
        ).all(devId, pn, pn) as { id: number }[]
      ).map((x) => x.id);
      slot = { ids, used: 0 };
      slotIndex.set(key, slot);
    }
    const id = slot.ids[slot.used];
    slot.used++;
    return id;
  };
  for (let i = 0; i < rt.rows.length; i++) {
    const r = rt.rows[i];
    const rowNo = i + 2; // +2: هدر + ۱-مبنا

    // --- مقصد: سریال تجهیز ستون اول، یا دستگاه هدف انتخابی ---
    let targetLabel = 'تجهیز مقصد';
    if (r.deviceSerial) {
      let d = deviceCache.get(r.deviceSerial);
      if (!d) {
        const found = db.prepare(`SELECT id FROM devices WHERE main_serial = ? AND project_id = ?`).get(r.deviceSerial, project_id) as { id: number } | undefined;
        d = found ? { id: found.id, exists: true } : { id: 0, exists: false };
        deviceCache.set(r.deviceSerial, d);
      }
      if (d.exists) {
        targetLabel = `تجهیز موجود #${d.id}`;
      } else {
        targetLabel = `دستگاه جدید (سریال ${r.deviceSerial})`;
      }
    } else if (device_id) {
      targetLabel = `تجهیز مقصد #${device_id}`;
    } else {
      missingSerialRows++;
    }

    if (!r.partNumber) {
      warnings.push(`ردیف ${rowNo}: پارت‌نامبر خالی است — نادیده گرفته می‌شود.`);
      continue;
    }
    if (!r.partSerial) {
      warnings.push(`ردیف ${rowNo}: سریال قطعه خالی است — نادیده گرفته می‌شود.`);
      continue;
    }

    // سریال تجهیز با پارت‌نامبر خودش → به‌روزرسانی main_serial (بلوک دستگاه در خروجی تجهیزات)
    const devInfo = r.deviceSerial ? deviceCache.get(r.deviceSerial) : undefined;
    if (devInfo?.exists) {
      const devPnRow = db.prepare(`SELECT part_number_1, part_number_2 FROM devices WHERE id = ?`).get(devInfo.id) as { part_number_1: string | null; part_number_2: string | null } | undefined;
      const devPn = devPnRow ? normalizePartNumber(devPnRow.part_number_1 || devPnRow.part_number_2 || '') : '';
      if (devPn && normalizePartNumber(r.partNumber) === devPn) {
        mainSerialUpdates++;
        actions.push({ row: rowNo, col: '—', partNumber: r.partNumber, serial: r.partSerial, action: 'set_main_serial', target: `تجهیز موجود #${devInfo.id}` });
        continue;
      }
    }

    // تطبیق اسلاتی داخل دستگاه مقصد (سریال ستون اول، یا تجهیز مقصد انتخابی فقط وقتی ردیف سریال ندارد)
    const targetDevId = devInfo?.exists ? devInfo.id : !r.deviceSerial ? device_id : undefined;
    let matchedId: number | undefined;
    if (targetDevId) {
      matchedId = takeSlot(normalizePartNumber(r.partNumber), targetDevId);
    }
    if (matchedId !== undefined) {
      const t = db.prepare(`SELECT title FROM parts WHERE id = ?`).get(matchedId) as { title: string } | undefined;
      updatedParts++;
      actions.push({ row: rowNo, col: '—', partNumber: r.partNumber, serial: r.partSerial, action: 'update_part', target: `قطعه #${matchedId} «${t?.title ?? ''}» → ${targetLabel}` });
    } else if (devInfo?.exists || device_id) {
      // اسلات‌های دستگاه مقصد تمام شد (چند قطعه‌ی هم‌پارت‌نامبر مجاز است) یا مقصد انتخابی → قطعه‌ی جدید روی همان تجهیز
      // یکسان‌سازی فقط در سطح کاتالوگ است؛ رکورد هر نمونه مستقل می‌ماند و از دستگاه دیگر انتقال نمی‌یابد
      createdParts++;
      actions.push({ row: rowNo, col: '—', partNumber: r.partNumber, serial: r.partSerial, action: 'create_part', target: `${r.title || r.kind || r.partNumber} → ${targetLabel}` });
    } else {
      // نه سریال تجهیز در فایل هست و نه مقصد انتخابی → نادیده (مطابق ثبت واقعی)
      skippedPreview++;
    }
  }

  if (skippedPreview > 0) {
    warnings.push(`${String(skippedPreview).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])} ردیف بدون «سریال تجهیز» و بدون تجهیز مقصد — نادیده گرفته می‌شوند.`);
  } else if (missingSerialRows > 0 && !device_id) {
    warnings.push('برخی ردیف‌ها «سریال تجهیز» ندارند و هیچ تجهیز مقصدی هم انتخاب نشده — این ردیف‌ها نادیده گرفته می‌شوند.');
  }
  const newDevices = [...deviceCache.values()].filter((d) => !d.exists).length;

  return {
    file: analysis.file.filename,
    projectId: project_id,
    projectName: analysis.device?.project_name ?? (db.prepare(`SELECT name FROM projects WHERE id = ?`).get(project_id) as { name: string } | undefined)?.name ?? null,
    deviceId: device_id ?? null,
    mode: 'row_template' as const,
    rowsDetected: rt.rows.length,
    columnsTotal: 0,
    columnsMatched: 0,
    columnsCreated: 0,
    willUpdateParts: updatedParts,
    willCreateParts: createdParts,
    willCreateDevices: newDevices,
    willUpdateMainSerial: mainSerialUpdates > 0,
    columns: [],
    actions,
    actionsTruncated: false,
    actionsCap: PREVIEW_ACTIONS_CAP,
    descConflicts: [],
    warnings,
  };
}

function handleUpload(body: Buffer, contentType: string, req: Request, res: Response): void {
  const analysis = analyzeUpload(body, contentType, res);
  if (!analysis) return;

  // --- مسیر قالب ردیف‌محور (نسخه‌ی ۲) ---
  if (analysis.rowTemplate) {
    return handleRowTemplateUpload(analysis, req, res);
  }

  const { project_id, device_id, create_per_row, device, devicePn, columns, serialRows, deviceTemplate } = analysis;
  const db = getDb();

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
  // یکتایی سریال قطعه — سریال‌های مصرف‌شده در همین import + چک دیتابیس
  const usedSerials = new Set<string>();
  const isDuplicateSerial = (serial: string, rowNo: number, pn: string): boolean => {
    const key = serial.trim().toUpperCase();
    if (!key) return false;
    if (usedSerials.has(key)) {
      skipped.push({ row: rowNo, column: 'سریال قطعه', partNumber: pn, reason: `سریال «${serial.trim()}» در همین فایل تکرار شده است — سریال باید یکتا باشد.` });
      return true;
    }
    const dup = findDuplicateSerial(db, serial);
    if (dup) {
      skipped.push({ row: rowNo, column: 'سریال قطعه', partNumber: pn, reason: `سریال «${serial.trim()}» از قبل ثبت شده (قطعه #${dup.id} «${dup.title}») — سریال باید یکتا باشد.` });
      return true;
    }
    usedSerials.add(key);
    return false;
  };

  const todayJ = (() => {
    const j = jalaali.toJalaali(new Date());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  })();
  const todayG = new Date().toISOString().slice(0, 10);

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
          if (isDuplicateSerial(s.value, row.rowNumber, col.partNumber)) continue;
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
          if (isDuplicateSerial(s.value, row.rowNumber, col.partNumber)) continue;
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

        if (isDuplicateSerial(s.value, row.rowNumber, col.partNumber)) continue;
        updatePartStmt.run(s.value, target);
        applied.push({ kind: 'part', partId: target, serial: s.value, title: col.title });
      }
    }
  });

  // یکسان‌سازی: قطعات تازه‌وارد به کاتالوگ وصل و با مرجع هم‌راستا می‌شوند
  const catalogSynced = syncPartsToCatalog(getDb());

  res.json({
    ok: true,
    summary: {
      file: analysis.file.filename,
      projectId: project_id,
      projectName: device?.project_name ?? null,
      deviceId: device_id ?? null,
      deviceMainSerial: device?.main_serial ?? null,
      devicesCreated: createdDevices,
      columnsTotal: columns.length,
      columnsMatched: analysis.matchedColumns,
      columnsCreated: analysis.createdColumns,
      serialRows: serialRows.length,
      partsUpdated: applied.filter((a) => a.kind === 'part').length,
      partsCreated: applied.filter((a) => a.kind === 'new-part').length,
      deviceSerialUpdated: applied.some((a) => a.kind === 'device'),
    },
    descConflicts: analysis.descConflicts,
    unmatchedPartNumbers: analysis.unmatched,
    skipped: skipped.slice(0, 100),
  });
}

// ============================================================
// GET /api/serial-import/template — دانلود قالب اکسل ردیف‌محور (نسخه‌ی ۲)
// ----------------------------------------------------------------
// ساختار: «هر ردیف = یک قطعه» — تفکیک‌پذیر و صریح:
//   سریال تجهیز | نوع قطعه | عنوان قطعه | پارت‌نامبر | سریال قطعه | مشخصات
//   • پارسر جدید این قالب را با همان endpoint اصلی می‌خواند (تشخیص خودکار).
//   • ستون «سریال تجهیز» دستگاه مقصد را مشخص می‌کند؛ در حالت تک‌دستگاهه
//     می‌تواند خالی باشد.
// ============================================================
router.get('/template', (req: Request, res: Response) => {
  const headers = ['سریال تجهیز', 'نوع قطعه', 'عنوان قطعه', 'پارت‌نامبر', 'سریال قطعه', 'مشخصات فنی'];
  const today = (() => {
    const j = jalaali.toJalaali(new Date());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  })();

  const sample = [
    ['SN-1A2B3C', 'منبع تغذیه', 'Power Supply 800W', '815983-B21', '5CD1234567', 'Redundant 800W'],
    ['SN-1A2B3C', 'حافظه RAM', '32GB DDR4', '840758-001', '5CD1234568', 'PC4-2666V'],
    ['SN-1A2B3C', 'هارد', '1TB SAS 10K', '781518-B21', '5CD1234569', '2.5in SAS'],
    ['SN-4D5E6F', 'پردازنده', 'Xeon Gold 6130', '818356-L21', '5CD1234570', '2.1GHz 16C'],
    ['SN-4D5E6F', 'منبع تغذیه', 'Power Supply 800W', '815983-B21', '5CD1234571', 'Redundant 800W'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'ورود قطعات');

  // شیت راهنما
  const guide = [
    ['راهنمای قالب ورود قطعات (هر ردیف = یک قطعه)'],
    [''],
    ['ستون', 'الزامی', 'توضیح'],
    ['سریال تجهیز', 'شرطی', 'سریال دستگاهی که قطعه روی آن نصب شده است. اگر فقط یک دستگاه مقصد در سامانه انتخاب شده باشد، می‌تواند خالی بماند.'],
    ['نوع قطعه', 'خیر', 'مثل: منبع تغذیه، حافظه RAM، هارد، پردازنده. در فهرست قطعات به‌عنوان بخشی از مشخصات ذخیره می‌شود.'],
    ['عنوان قطعه', 'بله', 'عنوان نمایشی قطعه. اگر خالی باشد از پارت‌نامبر استفاده می‌شود.'],
    ['پارت‌نامبر', 'بله', 'کلید تطبیق با سامانه — اگر قطعه‌ای با این پارت‌نامبر وجود داشته باشد سریالش به‌روز می‌شود، وگرنه قطعه‌ی جدید ساخته می‌شود.'],
    ['سریال قطعه', 'بله*', 'سریال منحصربه‌فرد قطعه — ستون اصلی این قالب.'],
    ['مشخصات فنی', 'خیر', 'توضیحات تکمیلی/مدل.'],
    [''],
    ['تاریخ تولید قالب', today],
    ['سامانه', 'Support Equipment Management — طراحی: میثم ایجادی'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'راهنما');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', "attachment; filename=\"support-parts-template.xlsx\"");
  res.send(buf);
});

/**
 * تجزیه‌ی قالب ردیف‌محور (نسخه‌ی ۲): هر ردیف = یک قطعه با سریال تجهیز مشخص.
 * اگر قالب نباشد null برمی‌گرداند تا مسیر قدیمی (ستون‌محور) اجرا شود.
 */
function parseRowTemplate(rows: Record<string, string>[]): RowTemplateData | null {
  if (rows.length === 0) return null;

  // هدر = اولین ردیف حاوی «سریال قطعه» یا «پارت‌نامبر»
  const headerIdx = rows.findIndex((r) => {
    const vals = Object.values(r).map((v) => String(v).trim());
    return vals.includes('سریال قطعه') || vals.includes('پارت‌نامبر');
  });
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const findCol = (...names: string[]): string | null => {
    for (const [letter, value] of Object.entries(header)) {
      if (names.includes(String(value).trim())) return letter;
    }
    return null;
  };

  const serialDevCol = findCol('سریال تجهیز');
  const kindCol = findCol('نوع قطعه');
  const titleCol = findCol('عنوان قطعه');
  const pnCol = findCol('پارت‌نامبر');
  const serialCol = findCol('سریال قطعه');
  const specsCol = findCol('مشخصات فنی', 'مشخصات');

  if (!pnCol || !serialCol) return null; // قالب ردیف‌محور نیست

  const data: RowTemplateData = { rows: [] };
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const pn = String(r[pnCol] ?? '').trim();
    const serial = String(r[serialCol] ?? '').trim();
    if (!pn && !serial) continue; // ردیف خالی
    data.rows.push({
      deviceSerial: serialDevCol ? String(r[serialDevCol] ?? '').trim() : '',
      kind: kindCol ? String(r[kindCol] ?? '').trim() : '',
      title: titleCol ? String(r[titleCol] ?? '').trim() : '',
      partNumber: pn,
      partSerial: serial,
      specs: specsCol ? String(r[specsCol] ?? '').trim() : '',
    });
  }
  if (data.rows.length === 0) return null;
  return data;
}

interface RowTemplateRow {
  deviceSerial: string;
  kind: string;
  title: string;
  partNumber: string;
  partSerial: string;
  specs: string;
}

interface RowTemplateData {
  rows: RowTemplateRow[];
}

// ---------- ثبت واقعی قالب ردیف‌محور ----------
function handleRowTemplateUpload(analysis: Analysis, req: Request, res: Response): void {
  const db = getDb();
  const rt = analysis.rowTemplate!;
  const { project_id, device_id } = analysis;

  type Applied =
    | { kind: 'part'; partId: number; serial: string; title: string }
    | { kind: 'new-part'; title: string; pn: string; serial: string }
    | { kind: 'device'; serial: string; title: string };
  const applied: Applied[] = [];
  const skipped: { row: number; column: string; partNumber: string; reason: string }[] = [];
  let createdDevices = 0;

  // یکتایی سریال قطعه — سریال‌های مصرف‌شده در همین import + چک دیتابیس
  const usedSerials = new Set<string>();
  const isDuplicateSerial = (serial: string, rowNo: number, pn: string): boolean => {
    const key = serial.trim().toUpperCase();
    if (!key) return false;
    if (usedSerials.has(key)) {
      skipped.push({ row: rowNo, column: 'سریال قطعه', partNumber: pn, reason: `سریال «${serial.trim()}» در همین فایل تکرار شده است — سریال باید یکتا باشد.` });
      return true;
    }
    const dup = findDuplicateSerial(db, serial);
    if (dup) {
      skipped.push({ row: rowNo, column: 'سریال قطعه', partNumber: pn, reason: `سریال «${serial.trim()}» از قبل ثبت شده (قطعه #${dup.id} «${dup.title}») — سریال باید یکتا باشد.` });
      return true;
    }
    usedSerials.add(key);
    return false;
  };

  const insertPartStmt = db.prepare(
    `INSERT INTO parts (device_id, title, tech_specs, part_number_1, part_serial_number, status, sold_at_jalali, sold_at_gregorian, created_by)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  );
  const insertDeviceStmt = db.prepare(
    `INSERT INTO devices (project_id, main_serial, device_type_id, device_model_id, brand_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  );
  const updatePartStmt = db.prepare(`UPDATE parts SET part_serial_number = ? WHERE id = ?`);

  const todayJ = (() => {
    const j = jalaali.toJalaali(new Date());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  })();
  const todayG = new Date().toISOString().slice(0, 10);

  // الگوی دستگاه برای ساخت دستگاه‌های جدید — مشابه حالت چنددستگاهه
  let deviceTemplate: DeviceTemplate | undefined;
  deviceTemplate = device_id
    ? (db.prepare(`SELECT device_type_id, device_model_id, brand_id FROM devices WHERE id = ?`).get(device_id) as DeviceTemplate | undefined)
    : (db.prepare(`SELECT device_type_id, device_model_id, brand_id FROM devices WHERE project_id = ? ORDER BY id LIMIT 1`).get(project_id) as DeviceTemplate | undefined);
  if (!deviceTemplate) {
    const firstType = db.prepare(`SELECT id FROM device_types ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
    if (!firstType) {
      res.status(400).json({ error: 'برای ساخت خودکار دستگاه، ابتدا حداقل یک «نوع تجهیز» در مدیریت لیست‌ها ثبت کنید.' });
      return;
    }
    deviceTemplate = { device_type_id: firstType.id, device_model_id: null, brand_id: null };
  }

  const deviceCache = new Map<string, number>(); // سریال → device_id
  const resolveDevice = (serial: string): number | null => {
    if (!serial && device_id) return device_id;
    if (!serial) return null;
    const cached = deviceCache.get(serial);
    if (cached) return cached;
    const found = db.prepare(`SELECT id FROM devices WHERE main_serial = ? AND project_id = ?`).get(serial, project_id) as { id: number } | undefined;
    let id: number;
    if (found) {
      id = found.id;
    } else {
      id = insertDeviceStmt.run(project_id, serial, deviceTemplate!.device_type_id, deviceTemplate!.device_model_id, deviceTemplate!.brand_id, req.user!.sub).lastInsertRowid as number;
      createdDevices++;
    }
    deviceCache.set(serial, id);
    return id;
  };

  // --- تطبیق اسلاتی: (پارت‌نامبر، دستگاه) → قطعات موجود به‌ترتیب id ---
  // خروجی فهرست انبار این سامانه چند ردیف هم‌پارت‌نامبر روی یک دستگاه دارد
  // (مثلاً ۴ RAM)؛ به‌ترتیب اسلات مصرف می‌شوند تا دوباره‌سازی نشود.
  const slotIndex = new Map<string, { ids: number[]; used: number }>();
  const slotKey = (pn: string, devId: number) => `${pn}#${devId}`;
  const takeSlot = (pn: string, devId: number): number | undefined => {
    const key = slotKey(pn, devId);
    let slot = slotIndex.get(key);
    if (!slot) {
      const ids = (
        db.prepare(
          `SELECT id FROM parts
           WHERE device_id = ?
             AND (UPPER(REPLACE(COALESCE(part_number_1,''), ' ', '')) = ?
                  OR UPPER(REPLACE(COALESCE(part_number_2,''), ' ', '')) = ?)
           ORDER BY id`
        ).all(devId, pn, pn) as { id: number }[]
      ).map((x) => x.id);
      slot = { ids, used: 0 };
      slotIndex.set(key, slot);
    }
    const id = slot.ids[slot.used];
    slot.used++;
    return id;
  };

  runTransaction(db, () => {
  for (let i = 0; i < rt.rows.length; i++) {
    const r = rt.rows[i];
    const rowNo = i + 2;

    if (!r.partNumber && !r.partSerial) continue; // ردیف کاملاً خالی
      if (!r.partSerial) {
        skipped.push({ row: rowNo, column: 'سریال قطعه', partNumber: r.partNumber, reason: 'سریال قطعه خالی است.' });
        continue;
      }
      if (!r.partNumber) {
        skipped.push({ row: rowNo, column: 'پارت‌نامبر', partNumber: '', reason: 'پارت‌نامبر خالی است.' });
        continue;
      }

      const devId = resolveDevice(r.deviceSerial);
      if (devId === null) {
        skipped.push({ row: rowNo, column: 'سریال تجهیز', partNumber: r.partNumber, reason: 'نه سریال تجهیز در فایل هست و نه تجهیز مقصدی انتخاب شده.' });
        continue;
      }

      // سریال تجهیز با پارت‌نامبر خودش → main_serial (بلوک دستگاه در خروجی تجهیزات)
      const devPnRow = db.prepare(`SELECT part_number_1, part_number_2 FROM devices WHERE id = ?`).get(devId) as { part_number_1: string | null; part_number_2: string | null } | undefined;
      const devPn = devPnRow ? normalizePartNumber(devPnRow.part_number_1 || devPnRow.part_number_2 || '') : '';
      if (devPn && normalizePartNumber(r.partNumber) === devPn) {
        db.prepare(`UPDATE devices SET main_serial = ? WHERE id = ?`).run(r.partSerial, devId);
        applied.push({ kind: 'device', serial: r.partSerial, title: `تجهیز #${devId}` });
        continue;
      }

      // یکتایی سریال — تکراری → skip با دلیل (نه شکست کل import)
      if (isDuplicateSerial(r.partSerial, rowNo, r.partNumber)) continue;

      // تطبیق اسلاتی داخل دستگاه مقصد — چند قطعه‌ی هم‌پارت‌نامبر روی یک تجهیز مجاز است؛
      // پس از اتمام اسلات‌ها قطعه‌ی جدید ساخته می‌شود (یکسان‌سازی فقط در سطح کاتالوگ است)
      const matchedId = takeSlot(normalizePartNumber(r.partNumber), devId);
      if (matchedId !== undefined) {
        const t = db.prepare(`SELECT title FROM parts WHERE id = ?`).get(matchedId) as { title: string } | undefined;
        updatePartStmt.run(r.partSerial, matchedId);
        applied.push({ kind: 'part', partId: matchedId, serial: r.partSerial, title: t?.title ?? '' });
      } else {
        // قطعه‌ی جدید روی همان تجهیز — هیچ رکوردی از دستگاه دیگری منتقل نمی‌شود
        const title = r.title || r.kind || r.partNumber;
        const specs = [r.kind, r.specs].filter(Boolean).join(' | ') || null;
        insertPartStmt.run(devId, title, specs, r.partNumber, r.partSerial, todayJ, todayG, req.user!.sub);
        applied.push({ kind: 'new-part', title, pn: r.partNumber, serial: r.partSerial });
      }
    }
  });

  // یکسان‌سازی: قطعات تازه‌وارد به کاتالوگ وصل و با مرجع هم‌راستا می‌شوند
  const catalogSynced = syncPartsToCatalog(getDb());

  res.json({
    ok: true,
    summary: {
      file: analysis.file.filename,
      projectId: project_id,
      projectName: (db.prepare(`SELECT name FROM projects WHERE id = ?`).get(project_id) as { name: string } | undefined)?.name ?? null,
      deviceId: device_id ?? null,
      deviceMainSerial: analysis.device?.main_serial ?? null,
      devicesCreated: createdDevices,
      columnsTotal: 0,
      columnsMatched: 0,
      columnsCreated: 0,
      serialRows: rt.rows.length,
      partsUpdated: applied.filter((a) => a.kind === 'part').length,
      partsCreated: applied.filter((a) => a.kind === 'new-part').length,
      deviceSerialUpdated: applied.some((a) => a.kind === 'device'),
      mode: 'row_template',
    },
    descConflicts: [],
    unmatchedPartNumbers: [],
    skipped: skipped.slice(0, 100),
  });
}

export default router;
