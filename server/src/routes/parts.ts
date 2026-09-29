// ============================================================
// قطعات یدکی — مسیرهای API
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها: GET برای همه؛ نوشتن فقط admin.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { datePairFromJalali } from '../lib/date.js';
import { requireRole } from '../middleware/auth.js';
import { upsertCatalogEntry } from './partCatalog.js';

const router = Router();

/**
 * بررسی یکتایی سریال قطعه — هر سریال فقط یک بار در کل سامانه (مقایسه‌ی case/فاصله‌نا‌حساس).
 * در صورت تکرار، پیام خطای فارسی با شماره‌ی قطعه‌ی صاحب سریال برمی‌گرداند.
 */
export function findDuplicateSerial(
  db: ReturnType<typeof getDb>,
  serial: string | null | undefined,
  excludePartId?: number,
): { id: number; title: string; device_id: number } | null {
  const s = String(serial ?? '').trim();
  if (!s) return null;
  const row = db.prepare(
    `SELECT id, title, device_id FROM parts
     WHERE UPPER(TRIM(part_serial_number)) = UPPER(?)
       AND TRIM(COALESCE(part_serial_number, '')) != ''
       ${excludePartId ? 'AND id != ?' : ''}
     ORDER BY id LIMIT 1`
  ).get(...(excludePartId ? [s, excludePartId] : [s])) as { id: number; title: string; device_id: number } | undefined;
  return row ?? null;
}

/** اگر سریال تکراری است، پاس ۴۰۹ بفرست و true برگردان */
export function rejectDuplicateSerial(res: import('express').Response, db: ReturnType<typeof getDb>, serial: string | null | undefined, excludePartId?: number): boolean {
  const dup = findDuplicateSerial(db, serial, excludePartId);
  if (dup) {
    res.status(409).json({
      error: `سریال «${String(serial).trim()}» از قبل در سامانه ثبت شده است (قطعه #${dup.id} «${dup.title}») — سریال قطعه باید یکتا باشد.`,
      duplicate_of: dup.id,
    });
    return true;
  }
  return false;
}

import { buildWarehouseWorkbook, sendWorkbook, type WarehouseExportRow } from '../lib/warehouseExport.js';

const partSchema = z.object({
  device_id: z.number().int().positive(),
  title: z.string().min(1),
  tech_specs: z.string().optional(),
  part_number_1: z.string().optional(),
  part_number_2: z.string().optional(),
  part_serial_number: z.string().optional(),
  sold_at_jalali: z.string().optional(),
});

/**
 * GET /api/parts/serial-check?serial=X — آیا این سریال از قبل در سامانه ثبت شده؟
 * برای هشدار زنده‌ی «سریال تکراری» در UI. هر کاربر واردی می‌تواند چک کند.
 */
router.get('/serial-check', (req, res) => {
  const serial = String(req.query.serial ?? '');
  if (!serial.trim()) return res.json({ exists: false });
  const db = getDb();
  const dup = findDuplicateSerial(db, serial);
  // همه‌ی قطعات با این سریال (نرمال‌شده) — برای دیالوگ «صاحب سریال»
  const matches = db.prepare(`
    SELECT p.id, p.title, p.part_serial_number, p.status,
           d.id AS device_id, d.main_serial AS device_serial,
           pr.name AS project_name
    FROM parts p
    LEFT JOIN devices d  ON d.id = p.device_id
    LEFT JOIN projects pr ON pr.id = d.project_id
    WHERE UPPER(TRIM(p.part_serial_number)) = UPPER(?)
      AND TRIM(COALESCE(p.part_serial_number, '')) != ''
    ORDER BY p.id
  `).all(serial.trim());
  res.json({ exists: !!dup, part_id: dup?.id ?? null, title: dup?.title ?? null, matches });
});

/** GET /api/parts — فهرست قطعات با اطلاعات دستگاه
 *  پارامترهای پرس‌وجوی اختیاری:
 *    ?device=X     → فقط قطعات دستگاه X
 *    ?status=active|replaced|defective → فقط قطعات با وضعیت دلخواه
 *    ?catalog=X    → فقط قطعات وصل به مرجع کاتالوگ X (لینک از تب کاتالوگ)
 */
router.get('/', (req, res) => {
  const db = getDb();
  const deviceId = req.query.device ? Number(req.query.device) : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const catalogId = req.query.catalog ? Number(req.query.catalog) : null;
  // جست‌وجوی فوری سریال (با شماره‌ی کامل یا بخشی از آن) — مقایسه‌ی case/فاصله‌ناحساس
  const serialQ = typeof req.query.serial === 'string' ? req.query.serial.trim() : '';

  const where: string[] = [];
  const params: (number | string)[] = [];
  if (deviceId !== null && !Number.isNaN(deviceId)) {
    where.push('p.device_id = ?');
    params.push(deviceId);
  }
  if (catalogId !== null && !Number.isNaN(catalogId)) {
    where.push('p.catalog_id = ?');
    params.push(catalogId);
  }
  if (serialQ) {
    where.push("UPPER(p.part_serial_number) LIKE UPPER('%' || ? || '%') ESCAPE '\\'");
    params.push(serialQ.replace(/[\\%_]/g, (ch) => '\\' + ch));
  }
  if (status === 'active' || status === 'replaced' || status === 'defective') {
    where.push('p.status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      p.id, p.title, p.tech_specs, p.part_number_1, p.part_number_2,
      p.part_serial_number, p.status, p.sold_at_jalali, p.sold_at_gregorian,
      p.replaces_part_id, p.created_at, p.catalog_id,
      d.id AS device_id, d.main_serial AS device_serial,
      dt.name AS device_type_name, b.name AS brand_name,
      pr.name AS project_name
    FROM parts p
    LEFT JOIN devices d       ON d.id = p.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN brands b        ON b.id = d.brand_id
    LEFT JOIN projects pr     ON pr.id = d.project_id
    ${whereSql}
    ORDER BY p.created_at DESC
  `).all(...params);
  res.json(rows);
});

/** GET /api/parts/:id — جزئیات یک قطعه + مسیر کامل (timeline) از فروش تا تعویض‌ها */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();

  const part = db.prepare(`
    SELECT p.*, d.main_serial AS device_serial, d.id AS device_id,
           dt.name AS device_type_name, b.name AS brand_name,
           pr.name AS project_name
    FROM parts p
    LEFT JOIN devices d       ON d.id = p.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN brands b        ON b.id = d.brand_id
    LEFT JOIN projects pr     ON pr.id = d.project_id
    WHERE p.id = ?
  `).get(id);
  if (!part) return res.status(404).json({ error: 'قطعه یافت نشد.' });

  // ردیابی زنجیره: ابتدا قطعه‌ی ریشه (منشأ) را پیدا کن، سپس از آن به پایین بساز
  const root = db.prepare(`
    WITH RECURSIVE origin AS (
      SELECT id, replaces_part_id FROM parts WHERE id = ?
      UNION ALL
      SELECT p.id, p.replaces_part_id FROM parts p JOIN origin o ON p.id = o.replaces_part_id
    )
    SELECT id FROM origin WHERE replaces_part_id IS NULL LIMIT 1
  `).get(id) as { id: number } | undefined;
  const rootId = root?.id ?? id;

  const chain = db.prepare(`
    WITH RECURSIVE chain AS (
      SELECT id, replaces_part_id, 0 AS depth FROM parts WHERE id = ?
      UNION ALL
      SELECT c2.id, c2.replaces_part_id, ch.depth + 1
      FROM parts c2 JOIN chain ch ON c2.replaces_part_id = ch.id
    )
    SELECT p.id, p.title, p.part_serial_number, p.status,
           p.sold_at_jalali, p.replaces_part_id
    FROM chain ch
    JOIN parts p ON p.id = ch.id
    ORDER BY ch.depth
  `).all(rootId);

  // تعویض‌هایی که در آن‌ها این قطعه نقش داشته (قدیمی یا جدید)
  const replacements = db.prepare(`
    SELECT
      wr.id, wr.replaced_at_jalali, wr.replaced_at_gregorian, wr.description,
      op.id AS old_part_id, op.title AS old_part_title, op.part_serial_number AS old_part_serial,
      np.id AS new_part_id, np.title AS new_part_title, np.part_serial_number AS new_part_serial,
      te.name AS expert_name, fr.name AS failure_reason_name
    FROM warranty_replacements wr
    LEFT JOIN parts op ON op.id = wr.old_part_id
    LEFT JOIN parts np ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr ON fr.id = wr.failure_reason_id
    WHERE wr.old_part_id = ? OR wr.new_part_id = ?
    ORDER BY wr.replaced_at_gregorian DESC
  `).all(id, id);

  return res.json({ part, chain, replacements });
});

/**
 * POST /api/parts/batch — ثبت گروهی قطعات یک تجهیز (فقط admin).
 * بدنه: { device_id, parts: [{ title, part_number_1?, part_number_2?,
 *          part_serial_number?, tech_specs?, sold_at_jalali? }] }
 * sold_at_jalali خالی = تاریخ فروش خود تجهیز (sold_at_jalali دستگاه).
 * کل عملیات در یک تراکنش است — اگر ردیفی نامعتبر باشد هیچ‌چیز ثبت نمی‌شود.
 */
const batchSchema = z.object({
  device_id: z.number().int().positive(),
  parts: z.array(z.object({
    title: z.string().min(1).max(200),
    tech_specs: z.string().max(2000).optional(),
    part_number_1: z.string().max(120).optional(),
    part_number_2: z.string().max(120).optional(),
    part_serial_number: z.string().max(120).optional(),
    sold_at_jalali: z.string().optional(),
  })).min(1).max(500),
});

router.post('/batch', requireRole('admin', 'warehouse', 'tech'), (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const { device_id, parts } = parsed.data;
  const db = getDb();

  const device = db.prepare(`SELECT id, sold_at_jalali FROM devices WHERE id = ?`).get(device_id) as { id: number; sold_at_jalali: string | null } | undefined;
  if (!device) return res.status(404).json({ error: 'تجهیز یافت نشد.' });

  const insert = db.prepare(`
    INSERT INTO parts
      (device_id, title, tech_specs, part_number_1, part_number_2,
       part_serial_number, status, sold_at_jalali, sold_at_gregorian, created_by, catalog_id)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);

  const serialsInBatch = new Set<string>();
  try {
    db.exec('BEGIN');
    const ids: number[] = [];
    for (const p of parts) {
      // یکتایی سریال — هم در برابر دیتابیس هم درون همین دسته
      const dup = findDuplicateSerial(db, p.part_serial_number);
      if (dup) {
        throw new Error(`سریال «${p.part_serial_number!.trim()}» از قبل ثبت شده است (قطعه #${dup.id} «${dup.title}») — سریال قطعه باید یکتا باشد.`);
      }
      const batchKey = p.part_serial_number?.trim().toUpperCase() || '';
      if (batchKey) {
        if (serialsInBatch.has(batchKey)) {
          throw new Error(`سریال «${p.part_serial_number!.trim()}» در همین لیست تکرار شده است.`);
        }
        serialsInBatch.add(batchKey);
      }
      // تاریخ ردیف اگر داده شده، وگرنه تاریخ فروش تجهیز
      const effectiveJalali = p.sold_at_jalali?.trim() || device.sold_at_jalali || '';
      const { jalali, gregorian } = datePairFromJalali(effectiveJalali);
      // اتصال به کاتالوگ — عنوان/توضیح/پارت‌نامبر مرجع حرف آخر را می‌زند (فقط سریال نمونه مستقل است)
      let catalogId: number | null = null;
      let title = p.title.trim();
      let techSpecs = p.tech_specs || null;
      let pn1 = p.part_number_1 || null;
      let pn2 = p.part_number_2 || null;
      if (p.part_number_1?.trim()) {
        catalogId = upsertCatalogEntry(db, p.part_number_1, { title, tech_specs: techSpecs, part_number_2: p.part_number_2 || null });
        const ref = db.prepare(`SELECT part_number_1, part_number_2, title, tech_specs FROM part_catalog WHERE id = ?`).get(catalogId) as { part_number_1: string; part_number_2: string | null; title: string; tech_specs: string | null };
        title = ref.title;
        techSpecs = ref.tech_specs;
        pn1 = ref.part_number_1;
        pn2 = ref.part_number_2;
      }
      const info = insert.run(
        device_id,
        title,
        techSpecs,
        pn1,
        pn2,
        p.part_serial_number || null,
        jalali,
        gregorian,
        req.user!.sub,
        catalogId,
      );
      ids.push(Number(info.lastInsertRowid));
    }
    db.exec('COMMIT');
    return res.status(201).json({ inserted: ids.length, ids });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    return res.status(400).json({ error: (e as Error).message || 'ثبت گروهی ناموفق بود.' });
  }
});

/** POST /api/parts — ثبت قطعه جدید برای یک دستگاه (فقط admin) */
router.post('/', requireRole('admin', 'warehouse', 'tech'), (req, res) => {
  const parsed = partSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const p = parsed.data;
  const { jalali, gregorian } = datePairFromJalali(p.sold_at_jalali || '');
  const db = getDb();

  // یکتایی سریال: هر سریال فقط یک بار در کل سامانه
  if (rejectDuplicateSerial(res, db, p.part_serial_number)) return;

  // اتصال به کاتالوگ: عنوان/توضیح/پارت‌نامبر مرجع حرف آخر را می‌زند (فقط سریال نمونه مستقل است)
  let catalogId: number | null = null;
  let title = p.title.trim();
  let techSpecs = p.tech_specs || null;
  let pn1 = p.part_number_1 || null;
  let pn2 = p.part_number_2 || null;
  if (p.part_number_1?.trim()) {
    catalogId = upsertCatalogEntry(db, p.part_number_1, { title, tech_specs: techSpecs, part_number_2: p.part_number_2 || null });
    const ref = db.prepare(`SELECT part_number_1, part_number_2, title, tech_specs FROM part_catalog WHERE id = ?`).get(catalogId) as { part_number_1: string; part_number_2: string | null; title: string; tech_specs: string | null };
    title = ref.title;
    techSpecs = ref.tech_specs;
    pn1 = ref.part_number_1;
    pn2 = ref.part_number_2;
  }

  const info = db.prepare(`
    INSERT INTO parts
      (device_id, title, tech_specs, part_number_1, part_number_2,
       part_serial_number, status, sold_at_jalali, sold_at_gregorian, created_by, catalog_id)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    p.device_id,
    title,
    techSpecs,
    pn1,
    pn2,
    p.part_serial_number || null,
    jalali,
    gregorian,
    req.user!.sub,
    catalogId
  );
  return res.status(201).json({ id: info.lastInsertRowid });
});

/** PUT /api/parts/:id — ویرایش قطعه (فقط admin) */
router.put('/:id', requireRole('admin', 'warehouse', 'tech'), (req, res) => {
  const parsed = partSchema.partial().omit({ device_id: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const p = parsed.data;
  const db = getDb();

  let jalali: string | null | undefined;
  let gregorian: string | null | undefined;
  if (p.sold_at_jalali !== undefined) {
    const pair = datePairFromJalali(p.sold_at_jalali || '');
    jalali = pair.jalali;
    gregorian = pair.gregorian;
  }

  // یکتایی سریال (خود قطعه مستثنی)
  if (p.part_serial_number !== undefined && rejectDuplicateSerial(res, db, p.part_serial_number, Number(req.params.id))) return;

  db.prepare(`
    UPDATE parts SET
      title = COALESCE(?, title),
      tech_specs = COALESCE(?, tech_specs),
      part_number_1 = COALESCE(?, part_number_1),
      part_number_2 = COALESCE(?, part_number_2),
      part_serial_number = COALESCE(?, part_serial_number),
      sold_at_jalali = COALESCE(?, sold_at_jalali),
      sold_at_gregorian = COALESCE(?, sold_at_gregorian)
    WHERE id = ?
  `).run(
    p.title?.trim() ?? null,
    p.tech_specs ?? null,
    p.part_number_1 ?? null,
    p.part_number_2 ?? null,
    p.part_serial_number ?? null,
    jalali ?? null,
    gregorian ?? null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

/**
 * GET /api/parts/export/warehouse — خروجی اکسل قطعات در قالب فهرست انبار
 * پارامتر اختیاری: ?device=X یا ?status=... (مثل فهرست)؛ خروجی قابل بازخورد به ورود سریال است.
 */
router.get('/export/warehouse', (req, res) => {
  const db = getDb();
  const deviceId = req.query.device ? Number(req.query.device) : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  const where: string[] = [];
  const params: (number | string)[] = [];
  if (deviceId !== null && !Number.isNaN(deviceId)) {
    where.push('p.device_id = ?');
    params.push(deviceId);
  }
  if (status === 'active' || status === 'replaced' || status === 'defective') {
    where.push('p.status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      p.title, p.tech_specs, p.part_number_1, p.part_number_2,
      p.part_serial_number, p.status,
      d.main_serial AS device_serial,
      dt.name AS device_type_name
    FROM parts p
    LEFT JOIN devices d       ON d.id = p.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    ${whereSql}
    ORDER BY d.main_serial, p.id
  `).all(...params) as {
    title: string; tech_specs: string | null; part_number_1: string | null; part_number_2: string | null;
    part_serial_number: string | null; status: string;
    device_serial: string | null; device_type_name: string | null;
  }[];

  const exportRows: WarehouseExportRow[] = rows.map((p) => ({
    deviceSerial: p.device_serial || '',
    kind: p.device_type_name || '',
    title: p.title || '',
    partNumber: p.part_number_1 || p.part_number_2 || '',
    partSerial: p.part_serial_number || '',
    specs: p.tech_specs || '',
  }));

  const wb = buildWarehouseWorkbook(exportRows, {
    title: `خروجی قطعات — ${exportRows.length} ردیف`,
    note: status === 'active' ? 'فقط قطعات فعال شامل این خروجی است.' : undefined,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  sendWorkbook(res, wb, `parts-warehouse-${stamp}.xlsx`);
});

/**
 * PATCH /api/parts/:id/field — ویرایش درجای یک فیلد (فقط admin).
 * Whitelist فیلدها: part_serial_number | part_number_1 | tech_specs
 * مقدار null یا رشته‌ی خالی بعد از trim = پاک‌کردن فیلد.
 */
const INLINE_FIELDS = {
  part_serial_number: { max: 120 },
  part_number_1: { max: 80 },
  tech_specs: { max: 2000 },
} as const;
type InlineField = keyof typeof INLINE_FIELDS;

router.patch('/:id/field', requireRole('admin', 'warehouse', 'tech'), (req, res) => {
  const fieldSchema = z.object({
    field: z.enum(['part_serial_number', 'part_number_1', 'tech_specs']),
    value: z.string().max(2000).optional().nullable(),
  });
  const parsed = fieldSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const field = parsed.data.field as InlineField;
  const raw = parsed.data.value;
  let value = typeof raw === 'string' ? raw.trim() : null; // null = پاک‌کردن
  if (value === '') value = null;
  if (value !== null && value.length > INLINE_FIELDS[field].max) {
    return res.status(400).json({ error: `حداکثر طول مجاز ${INLINE_FIELDS[field].max} کاراکتر است.` });
  }

  const db = getDb();
  const exists = db.prepare(`SELECT id FROM parts WHERE id = ?`).get(Number(req.params.id));
  if (!exists) return res.status(404).json({ error: 'قطعه یافت نشد.' });

  // یکتایی سریال (خود قطعه مستثنی)
  if (field === 'part_serial_number' && value && rejectDuplicateSerial(res, db, value, Number(req.params.id))) return;

  db.prepare(`UPDATE parts SET ${field} = ? WHERE id = ?`).run(value, Number(req.params.id));

  // اگر پارت‌نامبر عوض شد، قطعه به مرجع جدید کاتالوگ وصل و کاملاً یکسان می‌شود (PN نرمال‌شده‌ی مرجع)
  if (field === 'part_number_1' && value) {
    const part = db.prepare(`SELECT title, tech_specs, part_number_2 FROM parts WHERE id = ?`).get(Number(req.params.id)) as { title: string; tech_specs: string | null; part_number_2: string | null };
    const catalogId = upsertCatalogEntry(db, value, { title: part.title, tech_specs: part.tech_specs, part_number_2: part.part_number_2 });
    const ref = db.prepare(`SELECT part_number_1, part_number_2, title, tech_specs FROM part_catalog WHERE id = ?`).get(catalogId) as { part_number_1: string; part_number_2: string | null; title: string; tech_specs: string | null };
    db.prepare(`UPDATE parts SET catalog_id = ?, part_number_1 = ?, part_number_2 = ?, title = ?, tech_specs = ? WHERE id = ?`).run(catalogId, ref.part_number_1, ref.part_number_2, ref.title, ref.tech_specs, Number(req.params.id));
  }

  res.json({ ok: true, field, value });
});

router.delete('/:id', requireRole('admin', 'warehouse', 'tech'), (req, res) => {
  try {
    getDb().prepare(`DELETE FROM parts WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست.' });
  }
});

export default router;
