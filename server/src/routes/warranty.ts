// ============================================================
// تعویض قطعه تحت گارانتی — مسیرهای API
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها: GET برای همه؛ تعویض (POST) فقط admin.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb, runTransaction } from '../db/db.js';
import { datePairFromJalali, todayJalali, todayGregorian } from '../lib/date.js';
import { requireRole } from '../middleware/auth.js';
import { findDuplicateSerial } from './parts.js';
import * as XLSX from 'xlsx';
import { sendWorkbook, safeFileName } from '../lib/warehouseExport.js';

const router = Router();

const replacementSchema = z.object({
  device_id: z.number().int().positive(),
  old_part_id: z.number().int().positive(),
  // اطلاعات قطعه‌ی جدید
  new_part: z.object({
    title: z.string().min(1),
    tech_specs: z.string().optional(),
    part_number_1: z.string().optional(),
    part_number_2: z.string().optional(),
    part_serial_number: z.string().optional(),
  }),
  replaced_by_expert_id: z.number().int().positive().optional().nullable(),
  failure_reason_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional(),
  replaced_at_jalali: z.string().optional(),
});

/**
 * POST /api/warranty/replace
 * عملیات تعویض قطعه تحت گارنتی. در یک تراکنش:
 *   1) قطعه‌ی جدید ایجاد می‌شود (با replaces_part_id به قطعه‌ی قدیمی).
 *   2) قطعه‌ی قدیمی به وضعیت 'replaced' تغییر می‌کند.
 *   3) رکورد warranty_replacements ثبت می‌شود (قدیمی، جدید، تاریخ، کارشناس، دلیل، توضیحات).
 */
router.post('/replace', requireRole('admin'), (req, res) => {
  const parsed = replacementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const db = getDb();

  const { jalali, gregorian } = datePairFromJalali(b.replaced_at_jalali || todayJalali());
  if (!jalali || !gregorian) {
    return res.status(400).json({ error: 'تاریخ تعویض نامعتبر است.' });
  }

  const userId = req.user!.sub;

  // یکتایی سریال قطعه‌ی جدید — پیش از تراکنش تا ۴۰۰ تمیز برگردد (نه ۵۰۰)
  const dupSerial = findDuplicateSerial(db, b.new_part.part_serial_number);
  if (dupSerial) {
    return res.status(400).json({
      error: `سریال قطعه‌ی جدید «${b.new_part.part_serial_number!.trim()}» از قبل ثبت شده است (قطعه #${dupSerial.id} «${dupSerial.title}») — سریال باید یکتا باشد.`,
    });
  }

  const result = runTransaction(db, () => {
    // 1) تأیید وجود قطعه‌ی قدیمی و دستگاه
    const oldPart = db.prepare(`SELECT id, device_id FROM parts WHERE id = ?`).get(b.old_part_id);
    if (!oldPart) throw new Error('قطعه‌ی قدیمی یافت نشد.');

    // 2) ایجاد قطعه‌ی جدید (جانشین قطعه‌ی قدیمی) — سریال باید یکتا باشد
    const np = b.new_part;
    const dupSerial = findDuplicateSerial(db, np.part_serial_number);
    if (dupSerial) {
      throw new Error(`سریال قطعه‌ی جدید «${np.part_serial_number!.trim()}» از قبل ثبت شده است (قطعه #${dupSerial.id} «${dupSerial.title}») — سریال باید یکتا باشد.`);
    }
    const newPartInfo = db.prepare(`
      INSERT INTO parts
        (device_id, title, tech_specs, part_number_1, part_number_2,
         part_serial_number, status, sold_at_jalali, sold_at_gregorian,
         replaces_part_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      b.device_id,
      np.title.trim(),
      np.tech_specs || null,
      np.part_number_1 || null,
      np.part_number_2 || null,
      np.part_serial_number || null,
      jalali,
      gregorian,
      b.old_part_id,
      userId
    );
    const newPartId = newPartInfo.lastInsertRowid as number;

    // 3) قطعه‌ی قدیمی → وضعیت replaced
    db.prepare(`UPDATE parts SET status = 'replaced' WHERE id = ?`).run(b.old_part_id);

    // 4) ثبت رکورد تعویض
    const replInfo = db.prepare(`
      INSERT INTO warranty_replacements
        (device_id, old_part_id, new_part_id, replaced_by_expert_id,
         failure_reason_id, description, replaced_at_jalali, replaced_at_gregorian, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.device_id,
      b.old_part_id,
      newPartId,
      b.replaced_by_expert_id ?? null,
      b.failure_reason_id ?? null,
      b.description || null,
      jalali,
      gregorian,
      userId
    );

    return { newPartId, replacementId: replInfo.lastInsertRowid as number };
  });

  try {
    return res.status(201).json(result);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/** GET /api/warranty/replacements — فهرست همه تعویض‌ها (برای گزارش‌ها) */
router.get('/replacements', (req, res) => {
  const db = getDb();
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  // فیلتر اختیاری بر اساس دسته‌ی منطقی قطعه (عنوان + پارت‌نامبر) — برای کلیک
  // روی ردیف‌های «پرخرابی‌ترین قطعات» داشبورد/گزارش‌ها
  const partTitle = typeof req.query.part_title === 'string' ? req.query.part_title.trim() : '';
  const partNumber = typeof req.query.part_number === 'string' ? req.query.part_number.trim() : '';

  const BASE_SQL = `
    SELECT
      wr.id, wr.replaced_at_jalali, wr.replaced_at_gregorian, wr.description,
      d.id AS device_id, d.main_serial AS device_serial,
      p.name AS project_name,
      op.id AS old_part_id, op.title AS old_part_title, op.part_serial_number AS old_part_serial,
      np.id AS new_part_id, np.title AS new_part_title, np.part_serial_number AS new_part_serial,
      te.name AS expert_name, fr.name AS failure_reason_name
    FROM warranty_replacements wr
    LEFT JOIN devices d  ON d.id = wr.device_id
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN parts op   ON op.id = wr.old_part_id
    LEFT JOIN parts np   ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr  ON fr.id = wr.failure_reason_id
  `;

  // فیلتر دسته‌ی قطعه: عنوان دقیق + پارت‌نامبر دقیق (وقتی داده شده) — همان
  // کلیدی که گزارش most-failed-parts با آن گروه‌بندی می‌کند
  const partFilter = (partTitle || partNumber)
    ? `WHERE COALESCE(NULLIF(op.title, ''), '(بدون عنوان)') = ? ${partNumber ? 'AND op.part_number_1 ' + (partNumber === '(بدون پارت‌نامبر)' ? 'IS NULL' : '= ?') : ''}`
    : '';

  const projectFilter = projectId ? (partFilter ? 'AND d.project_id = ?' : 'WHERE d.project_id = ?') : '';

  const params: (string | number | null)[] = [];
  if (partTitle) params.push(partTitle);
  if (partNumber && partNumber !== '(بدون پارت‌نامبر)') params.push(partNumber);
  if (projectId) params.push(projectId);

  const rows = db.prepare(
    `${BASE_SQL} ${partFilter} ${projectFilter} ORDER BY wr.replaced_at_gregorian DESC`,
  ).all(...params);

  res.json(rows);
});

/**
 * GET /api/warranty/replacements/export — خروجی اکسل تعویض‌ها
 * همان فیلترهای فهرست (part_title/part_number/project_id) را می‌پذیرد.
 * ?columns=col1,col2 — انتخاب ستون‌ها (پیش‌فرض: همه‌ی ستون‌ها)
 * ?format=xlsx (پیش‌فرض) | csv
 * کلیدهای مجاز ستون (ترتیب اینجا = ترتیب پیش‌فرض):
 *   date, project, device_serial, old_title, old_pn, old_serial,
 *   new_title, new_pn, new_serial, failure_reason, expert, description
 */
const REPLACEMENT_COLUMNS: { key: string; label: string; get: (r: Record<string, string | null>) => string }[] = [
  { key: 'date',           label: 'تاریخ تعویض',      get: (r) => r.replaced_at_jalali || '' },
  { key: 'project',        label: 'پروژه',            get: (r) => r.project_name || '' },
  { key: 'device_serial',  label: 'سریال دستگاه',     get: (r) => r.device_serial || '' },
  { key: 'old_title',      label: 'قطعه‌ی قدیم',      get: (r) => r.old_part_title || '' },
  { key: 'old_pn',         label: 'پارت‌نامبر قدیم',  get: (r) => r.old_part_pn || '' },
  { key: 'old_serial',     label: 'سریال قدیم',       get: (r) => r.old_part_serial || '' },
  { key: 'new_title',      label: 'قطعه‌ی جدید',      get: (r) => r.new_part_title || '' },
  { key: 'new_pn',         label: 'پارت‌نامبر جدید',  get: (r) => r.new_part_pn || '' },
  { key: 'new_serial',     label: 'سریال جدید',       get: (r) => r.new_part_serial || '' },
  { key: 'failure_reason', label: 'دلیل خرابی',       get: (r) => r.failure_reason_name || '' },
  { key: 'expert',         label: 'کارشناس',          get: (r) => r.expert_name || '' },
  { key: 'description',    label: 'توضیحات',          get: (r) => r.description || '' },
];

router.get('/replacements/export', (req, res) => {
  const db = getDb();
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const partTitle = typeof req.query.part_title === 'string' ? req.query.part_title.trim() : '';
  const partNumber = typeof req.query.part_number === 'string' ? req.query.part_number.trim() : '';

  const BASE_SQL = `
    SELECT
      wr.id, wr.replaced_at_jalali, wr.description,
      d.main_serial AS device_serial, p.name AS project_name,
      op.title AS old_part_title, op.part_serial_number AS old_part_serial, op.part_number_1 AS old_part_pn,
      np.title AS new_part_title, np.part_serial_number AS new_part_serial, np.part_number_1 AS new_part_pn,
      te.name AS expert_name, fr.name AS failure_reason_name
    FROM warranty_replacements wr
    LEFT JOIN devices d  ON d.id = wr.device_id
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN parts op   ON op.id = wr.old_part_id
    LEFT JOIN parts np   ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr  ON fr.id = wr.failure_reason_id
  `;
  const partFilter = (partTitle || partNumber)
    ? `WHERE COALESCE(NULLIF(op.title, ''), '(بدون عنوان)') = ? ${partNumber ? 'AND op.part_number_1 ' + (partNumber === '(بدون پارت‌نامبر)' ? 'IS NULL' : '= ?') : ''}`
    : '';
  const projectFilter = projectId ? (partFilter ? 'AND d.project_id = ?' : 'WHERE d.project_id = ?') : '';

  const params: (string | number | null)[] = [];
  if (partTitle) params.push(partTitle);
  if (partNumber && partNumber !== '(بدون پارت‌نامبر)') params.push(partNumber);
  if (projectId) params.push(projectId);

  const rows = db.prepare(`${BASE_SQL} ${partFilter} ${projectFilter} ORDER BY wr.replaced_at_gregorian DESC`).all(...params) as
    { replaced_at_jalali: string; description: string | null; device_serial: string | null; project_name: string | null;
      old_part_title: string | null; old_part_serial: string | null; old_part_pn: string | null;
      new_part_title: string | null; new_part_serial: string | null; new_part_pn: string | null;
      expert_name: string | null; failure_reason_name: string | null }[];

  // --- انتخاب ستون‌ها (whitelist) — ترتیب خروجی = ترتیب انتخاب کاربر ---
  const requestedCols = typeof req.query.columns === 'string' ? req.query.columns.split(',').map((s) => s.trim()) : [];
  let selectedCols = REPLACEMENT_COLUMNS.filter((c) => requestedCols.includes(c.key));
  if (selectedCols.length === 0) selectedCols = REPLACEMENT_COLUMNS; // پیش‌فرض: همه

  const data = rows.map((r) => selectedCols.map((c) => c.get(r as unknown as Record<string, string | null>)));

  const stamp = new Date().toISOString().slice(0, 10);
  const fname = partTitle ? `replacements-${safeFileName(partTitle)}-${stamp}` : `replacements-${stamp}`;

  // --- فرمت CSV (برای اکسل فارسی/ساده) در صورت درخواست ---
  if (String(req.query.format ?? 'xlsx') === 'csv') {
    const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      selectedCols.map((c) => csvEscape(c.label)).join(','),
      ...data.map((row) => row.map((v) => csvEscape(String(v))).join(',')),
    ];
    // BOM برای نمایش درست فارسی در اکسل ویندوز
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(fname + '.csv')}"`);
    res.setHeader('Cache-Control', 'no-store');
    return void res.send('\uFEFF' + lines.join('\r\n'));
  }

  const ws = XLSX.utils.aoa_to_sheet([selectedCols.map((c) => c.label), ...data]);
  // عرض ستون‌ها بر اساس label — خوانا در حالت انتخابی هم
  ws['!cols'] = selectedCols.map((c) => ({
    wch: Math.max(10, Math.min(32, c.label.length + 8)),
  }));
  ws['!freeze'] = { xSplit: '0', ySplit: '1' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تعویض‌ها');

  sendWorkbook(res, wb, fname + '.xlsx');
});

void todayGregorian;
export default router;
