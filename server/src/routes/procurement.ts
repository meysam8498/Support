// ============================================================
// تأمین قطعات (Procurement) — مسیرهای API
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// یک قطعه → یک رکورد تأمین (UNIQUE part_id). منبع: داخلی/خارجی.
// نقش‌ها: GET برای همه؛ نوشتن فقط admin.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { datePairFromJalali } from '../lib/date.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const upsertSchema = z.object({
  part_id: z.number().int().positive(),
  source: z.enum(['internal', 'external']).optional(),
  source_detail: z.string().optional().nullable(),
  purchase_jalali: z.string().optional().nullable(),
  supplier_warranty_months: z.number().int().nonnegative().optional().nullable(),
  extra_notes: z.string().optional().nullable(),
});

/** GET /api/procurement — فهرست همه‌ی رکوردهای تأمین (اختیاری: ?part=X) */
router.get('/', (req, res) => {
  const db = getDb();
  const partId = req.query.part ? Number(req.query.part) : null;
  const params: number[] = [];
  let where = '';
  if (partId && !Number.isNaN(partId)) {
    where = 'WHERE pr.part_id = ?';
    params.push(partId);
  }
  const rows = db.prepare(`
    SELECT pr.*,
           p.title AS part_title, p.part_serial_number AS part_serial,
           d.main_serial AS device_serial, proj.name AS project_name
    FROM procurement pr
    LEFT JOIN parts p        ON p.id = pr.part_id
    LEFT JOIN devices d      ON d.id = p.device_id
    LEFT JOIN projects proj  ON proj.id = d.project_id
    ${where}
    ORDER BY pr.created_at DESC
  `).all(...params);
  res.json(rows);
});

/** GET /api/procurement/:partId — رکورد تأمین یک قطعه (به‌ازای part_id) */
router.get('/:partId', (req, res) => {
  const row = getDb().prepare(`
    SELECT pr.*,
           p.title AS part_title, p.part_serial_number AS part_serial
    FROM procurement pr
    LEFT JOIN parts p ON p.id = pr.part_id
    WHERE pr.part_id = ?
  `).get(Number(req.params.partId));
  if (!row) return res.status(404).json({ error: 'رکورد تأمین یافت نشد.' });
  res.json(row);
});

/**
 * PUT /api/procurement/:partId — upsert رکورد تأمین بر اساس part_id (فقط admin).
 * اگر وجود نداشت ساخته می‌شود؛ اگر داشت به‌روزرسانی می‌شود.
 */
router.put('/:partId', requireRole('admin'), (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const partId = Number(req.params.partId);
  if (b.part_id !== partId) {
    return res.status(400).json({ error: 'عدم تطابق part_id مسیر و بدنه.' });
  }
  const db = getDb();
  const part = db.prepare(`SELECT id FROM parts WHERE id = ?`).get(partId);
  if (!part) return res.status(404).json({ error: 'قطعه یافت نشد.' });

  const date = datePairFromJalali(b.purchase_jalali || '');
  const exists = db.prepare(`SELECT id FROM procurement WHERE part_id = ?`).get(partId);

  if (exists) {
    db.prepare(`
      UPDATE procurement SET
        source                   = COALESCE(?, source),
        source_detail            = COALESCE(?, source_detail),
        purchase_jalali          = COALESCE(?, purchase_jalali),
        purchase_gregorian       = COALESCE(?, purchase_gregorian),
        supplier_warranty_months = COALESCE(?, supplier_warranty_months),
        extra_notes              = COALESCE(?, extra_notes)
      WHERE part_id = ?
    `).run(
      b.source ?? null,
      b.source_detail ?? null,
      date.jalali,
      date.gregorian,
      b.supplier_warranty_months ?? null,
      b.extra_notes ?? null,
      partId
    );
    return res.json({ ok: true, part_id: partId });
  }

  const info = db.prepare(`
    INSERT INTO procurement
      (part_id, source, source_detail, purchase_jalali, purchase_gregorian,
       supplier_warranty_months, extra_notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    partId,
    b.source ?? 'internal',
    b.source_detail || null,
    date.jalali,
    date.gregorian,
    b.supplier_warranty_months ?? null,
    b.extra_notes || null,
    req.user!.sub
  );
  return res.status(201).json({ id: info.lastInsertRowid, part_id: partId });
});

/** DELETE /api/procurement/:partId — حذف رکورد تأمین یک قطعه (فقط admin) */
router.delete('/:partId', requireRole('admin'), (req, res) => {
  getDb().prepare(`DELETE FROM procurement WHERE part_id = ?`).run(Number(req.params.partId));
  res.json({ ok: true });
});

export default router;
