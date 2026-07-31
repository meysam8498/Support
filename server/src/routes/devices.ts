// ============================================================
// تجهیزات (داخلی: devices) — مسیرهای API
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها: GET برای همه‌ی کاربران احرازشده؛ نوشتن (POST/PUT/DELETE) فقط admin.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { datePairFromJalali, warrantyEndPair } from '../lib/date.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------------------------------------------------
// تجهیزات
// ---------------------------------------------------------------------------------------------------------------------

const deviceSchema = z.object({
  project_id: z.number().int().positive(),
  contract_number: z.string().optional(),
  sales_expert_id: z.number().int().positive().optional().nullable(),
  main_serial: z.string().optional(),
  part_number_1: z.string().optional(),
  part_number_2: z.string().optional(),
  device_type_id: z.number().int().positive(),
  device_model_id: z.number().int().positive().optional().nullable(),
  brand_id: z.number().int().positive().optional().nullable(),
  technical_expert_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional(),

  // تاریخ خروج از انبار
  warehouse_exit_jalali: z.string().optional().nullable(),
  // تاریخ تحویل به مشتری
  customer_delivery_jalali: z.string().optional().nullable(),
  // گارانتی: مدت (ماه) + شروع (شمسی). پایان در backend محاسبه می‌شود.
  warranty_duration_months: z.number().int().nonnegative().optional().nullable(),
  warranty_start_jalali: z.string().optional().nullable(),

  // وضعیت تجهیز و دلایل تعویض
  status: z.enum(['active', 'defective', 'replacing', 'replaced']).optional(),
  replacement_reason_type: z.enum(['hardware', 'software', 'other']).optional().nullable(),
  replacement_reason_desc: z.string().optional().nullable(),

  // تاریخ فروش (قدیمی، برای سازگاری)
  sold_at_jalali: z.string().optional(),
});

/** GET /api/devices — فهرست همه‌ی تجهیزات با اطلاعات پیوندی */
router.get('/', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT
      d.id, d.main_serial, d.contract_number, d.description, d.part_number_1, d.part_number_2,
      d.warehouse_exit_jalali, d.warehouse_exit_gregorian,
      d.customer_delivery_jalali, d.customer_delivery_gregorian,
      d.warranty_duration_months, d.warranty_start_jalali, d.warranty_start_gregorian,
      d.warranty_end_jalali, d.warranty_end_gregorian,
      d.status, d.replacement_reason_type, d.replacement_reason_desc,
      d.sold_at_jalali, d.sold_at_gregorian, d.created_at,
      p.id   AS project_id,   p.name AS project_name,
      se.id  AS sales_expert_id,  se.name AS sales_expert_name,
      dt.id  AS device_type_id,   dt.name AS device_type_name,
      dm.id  AS device_model_id,  dm.name AS device_model_name,
      b.id   AS brand_id,         b.name AS brand_name,
      te.id  AS technical_expert_id, te.name AS technical_expert_name,
      (SELECT COUNT(*) FROM parts WHERE device_id = d.id) AS parts_count,
      (SELECT COUNT(*) FROM warranty_replacements WHERE device_id = d.id) AS replacements_count,
      (SELECT COUNT(*) FROM warranty_requests WHERE device_id = d.id) AS warranty_requests_count
    FROM devices d
    LEFT JOIN projects p          ON p.id  = d.project_id
    LEFT JOIN sales_experts se    ON se.id = d.sales_expert_id
    LEFT JOIN device_types dt     ON dt.id = d.device_type_id
    LEFT JOIN device_models dm    ON dm.id = d.device_model_id
    LEFT JOIN brands b            ON b.id  = d.brand_id
    LEFT JOIN technical_experts te ON te.id = d.technical_expert_id
    ORDER BY d.created_at DESC
  `).all();
  res.json(rows);
});

/** GET /api/devices/:id — جزئیات یک تجهیز + قطعات + تاریخچه تعویض + درخواست گارانتی */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();

  const device = db.prepare(`
    SELECT
      d.*, p.name AS project_name, se.name AS sales_expert_name,
      dt.name AS device_type_name, dm.name AS device_model_name,
      b.name AS brand_name, te.name AS technical_expert_name
    FROM devices d
    LEFT JOIN projects p          ON p.id  = d.project_id
    LEFT JOIN sales_experts se    ON se.id = d.sales_expert_id
    LEFT JOIN device_types dt     ON dt.id = d.device_type_id
    LEFT JOIN device_models dm    ON dm.id = d.device_model_id
    LEFT JOIN brands b            ON b.id  = d.brand_id
    LEFT JOIN technical_experts te ON te.id = d.technical_expert_id
    WHERE d.id = ?
  `).get(id);

  if (!device) return res.status(404).json({ error: 'تجهیز یافت نشد.' });

  const parts = db.prepare(`
    SELECT p.*, pr.source, pr.supplier_warranty_months, pr.purchase_jalali
    FROM parts p
    LEFT JOIN procurement pr ON pr.part_id = p.id
    WHERE p.device_id = ?
    ORDER BY p.created_at DESC
  `).all(id);

  const replacements = db.prepare(`
    SELECT
      wr.*,
      op.title AS old_part_title, op.part_serial_number AS old_part_serial,
      np.title AS new_part_title, np.part_serial_number AS new_part_serial,
      te.name  AS expert_name, fr.name AS failure_reason_name
    FROM warranty_replacements wr
    LEFT JOIN parts op            ON op.id = wr.old_part_id
    LEFT JOIN parts np            ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr  ON fr.id = wr.failure_reason_id
    WHERE wr.device_id = ?
    ORDER BY wr.replaced_at_gregorian DESC
  `).all(id);

  const warrantyRequests = db.prepare(`
    SELECT * FROM warranty_requests WHERE device_id = ? ORDER BY created_at DESC
  `).all(id);

  return res.json({ device, parts, replacements, warrantyRequests });
});

/** POST /api/devices — ثبت تجهیز جدید (فقط admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const d = parsed.data;
  const db = getDb();

  const wh = datePairFromJalali(d.warehouse_exit_jalali || '');
  const dl = datePairFromJalali(d.customer_delivery_jalali || '');
  const sold = datePairFromJalali(d.sold_at_jalali || '');
  // محاسبه‌ی خودکار پایان گارانتی از شروع + مدت
  const ws = datePairFromJalali(d.warranty_start_jalali || '');
  const we = warrantyEndPair(ws.jalali, d.warranty_duration_months ?? null);

  const info = db.prepare(`
    INSERT INTO devices
      (project_id, contract_number, sales_expert_id, main_serial, part_number_1, part_number_2,
       device_type_id, device_model_id, brand_id, technical_expert_id, description,
       warehouse_exit_jalali, warehouse_exit_gregorian,
       customer_delivery_jalali, customer_delivery_gregorian,
       warranty_duration_months, warranty_start_jalali, warranty_start_gregorian,
       warranty_end_jalali, warranty_end_gregorian,
       status, replacement_reason_type, replacement_reason_desc,
       sold_at_jalali, sold_at_gregorian, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.project_id,
    d.contract_number || null,
    d.sales_expert_id ?? null,
    d.main_serial || null,
    d.part_number_1 || null,
    d.part_number_2 || null,
    d.device_type_id,
    d.device_model_id ?? null,
    d.brand_id ?? null,
    d.technical_expert_id ?? null,
    d.description || null,
    wh.jalali, wh.gregorian,
    dl.jalali, dl.gregorian,
    d.warranty_duration_months ?? null,
    ws.jalali, ws.gregorian,
    we.jalali, we.gregorian,
    d.status ?? 'active',
    d.replacement_reason_type ?? null,
    d.replacement_reason_desc ?? null,
    sold.jalali, sold.gregorian,
    req.user!.sub
  );
  return res.status(201).json({ id: info.lastInsertRowid });
});

/** PUT /api/devices/:id — ویرایش تجهیز (فقط admin) */
router.put('/:id', requireRole('admin'), (req, res) => {
  const parsed = deviceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const d = parsed.data;
  const db = getDb();

  // تبدیل هر تاریخ شمسیِ ارسالی به جفت شمسی/میلادی
  const wh = d.warehouse_exit_jalali !== undefined ? datePairFromJalali(d.warehouse_exit_jalali || '') : undefined;
  const dl = d.customer_delivery_jalali !== undefined ? datePairFromJalali(d.customer_delivery_jalali || '') : undefined;
  const sold = d.sold_at_jalali !== undefined ? datePairFromJalali(d.sold_at_jalali || '') : undefined;

  // اگر شروع گارانتی یا مدت تغییر کرد، پایان را بازمحاسبه کن.
  let ws: { jalali: string | null; gregorian: string | null } | undefined;
  let we: { jalali: string | null; gregorian: string | null } | undefined;
  if (d.warranty_start_jalali !== undefined || d.warranty_duration_months !== undefined) {
    const existing = db.prepare(
      `SELECT warranty_start_jalali, warranty_duration_months FROM devices WHERE id = ?`
    ).get(Number(req.params.id)) as { warranty_start_jalali: string | null; warranty_duration_months: number | null };
    const startJ = d.warranty_start_jalali !== undefined ? d.warranty_start_jalali : existing.warranty_start_jalali;
    const months = d.warranty_duration_months !== undefined ? d.warranty_duration_months : existing.warranty_duration_months;
    ws = datePairFromJalali(startJ || '');
    we = warrantyEndPair(ws.jalali, months ?? null);
  }

  db.prepare(`
    UPDATE devices SET
      project_id               = COALESCE(?, project_id),
      contract_number          = COALESCE(?, contract_number),
      sales_expert_id          = COALESCE(?, sales_expert_id),
      main_serial              = COALESCE(?, main_serial),
      part_number_1            = COALESCE(?, part_number_1),
      part_number_2            = COALESCE(?, part_number_2),
      device_type_id           = COALESCE(?, device_type_id),
      device_model_id          = COALESCE(?, device_model_id),
      brand_id                 = COALESCE(?, brand_id),
      technical_expert_id      = COALESCE(?, technical_expert_id),
      description              = COALESCE(?, description),
      warehouse_exit_jalali    = COALESCE(?, warehouse_exit_jalali),
      warehouse_exit_gregorian = COALESCE(?, warehouse_exit_gregorian),
      customer_delivery_jalali    = COALESCE(?, customer_delivery_jalali),
      customer_delivery_gregorian = COALESCE(?, customer_delivery_gregorian),
      warranty_duration_months = COALESCE(?, warranty_duration_months),
      warranty_start_jalali    = COALESCE(?, warranty_start_jalali),
      warranty_start_gregorian = COALESCE(?, warranty_start_gregorian),
      warranty_end_jalali      = COALESCE(?, warranty_end_jalali),
      warranty_end_gregorian   = COALESCE(?, warranty_end_gregorian),
      status                   = COALESCE(?, status),
      replacement_reason_type  = COALESCE(?, replacement_reason_type),
      replacement_reason_desc  = COALESCE(?, replacement_reason_desc),
      sold_at_jalali           = COALESCE(?, sold_at_jalali),
      sold_at_gregorian        = COALESCE(?, sold_at_gregorian)
    WHERE id = ?
  `).run(
    d.project_id ?? null,
    d.contract_number ?? null,
    d.sales_expert_id ?? null,
    d.main_serial ?? null,
    d.part_number_1 ?? null,
    d.part_number_2 ?? null,
    d.device_type_id ?? null,
    d.device_model_id ?? null,
    d.brand_id ?? null,
    d.technical_expert_id ?? null,
    d.description ?? null,
    wh?.jalali ?? null,
    wh?.gregorian ?? null,
    dl?.jalali ?? null,
    dl?.gregorian ?? null,
    d.warranty_duration_months ?? null,
    ws?.jalali ?? null,
    ws?.gregorian ?? null,
    we?.jalali ?? null,
    we?.gregorian ?? null,
    d.status ?? null,
    d.replacement_reason_type ?? null,
    d.replacement_reason_desc ?? null,
    sold?.jalali ?? null,
    sold?.gregorian ?? null,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

/** DELETE /api/devices/:id (فقط admin) */
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    getDb().prepare(`DELETE FROM devices WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست.' });
  }
});

export default router;
