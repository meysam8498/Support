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

  const result = runTransaction(db, () => {
    // 1) تأیید وجود قطعه‌ی قدیمی و دستگاه
    const oldPart = db.prepare(`SELECT id, device_id FROM parts WHERE id = ?`).get(b.old_part_id);
    if (!oldPart) throw new Error('قطعه‌ی قدیمی یافت نشد.');

    // 2) ایجاد قطعه‌ی جدید (جانشین قطعه‌ی قدیمی)
    const np = b.new_part;
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

  let rows;
  if (projectId) {
    rows = db.prepare(`
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
      WHERE d.project_id = ?
      ORDER BY wr.replaced_at_gregorian DESC
    `).all(projectId);
  } else {
    rows = db.prepare(`
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
      ORDER BY wr.replaced_at_gregorian DESC
    `).all();
  }
  res.json(rows);
});

void todayGregorian;
export default router;
