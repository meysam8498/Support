// ============================================================
// درخواست گارانتی تجهیزات — مسیرهای API
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها: GET برای همه؛ نوشتن فقط admin.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { datePairFromJalali, todayJalali } from '../lib/date.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const createSchema = z.object({
  device_id: z.number().int().positive(),
  description: z.string().optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'completed']).optional(),
  request_jalali: z.string().optional().nullable(),
});

const updateSchema = z.object({
  description: z.string().optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'completed']).optional(),
  request_jalali: z.string().optional().nullable(),
});

/** GET /api/warranty-requests — فهرست همه‌ی درخواست‌ها (اختیاری: ?device=X) */
router.get('/', (req, res) => {
  const db = getDb();
  const deviceId = req.query.device ? Number(req.query.device) : null;
  const params: number[] = [];
  let where = '';
  if (deviceId && !Number.isNaN(deviceId)) {
    where = 'WHERE wr.device_id = ?';
    params.push(deviceId);
  }
  const rows = db.prepare(`
    SELECT wr.*,
           d.main_serial AS device_serial, d.id AS device_id,
           dt.name AS device_type_name, p.name AS project_name,
           u.username AS created_by_name
    FROM warranty_requests wr
    LEFT JOIN devices d       ON d.id = wr.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN projects p      ON p.id = d.project_id
    LEFT JOIN users u         ON u.id = wr.created_by
    ${where}
    ORDER BY wr.created_at DESC
  `).all(...params);
  res.json(rows);
});

/** GET /api/warranty-requests/:id */
router.get('/:id', (req, res) => {
  const row = getDb().prepare(`
    SELECT wr.*,
           d.main_serial AS device_serial, d.id AS device_id,
           dt.name AS device_type_name, p.name AS project_name
    FROM warranty_requests wr
    LEFT JOIN devices d       ON d.id = wr.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN projects p      ON p.id = d.project_id
    WHERE wr.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'درخواست یافت نشد.' });
  res.json(row);
});

/** POST /api/warranty-requests — ثبت درخواست گارانتی جدید (فقط admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const db = getDb();
  const device = db.prepare(`SELECT id FROM devices WHERE id = ?`).get(b.device_id);
  if (!device) return res.status(404).json({ error: 'تجهیز یافت نشد.' });

  const date = datePairFromJalali(b.request_jalali || todayJalali());
  const info = db.prepare(`
    INSERT INTO warranty_requests
      (device_id, description, status, request_jalali, request_gregorian, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    b.device_id,
    b.description || null,
    b.status ?? 'pending',
    date.jalali,
    date.gregorian,
    req.user!.sub
  );
  return res.status(201).json({ id: info.lastInsertRowid });
});

/** PUT /api/warranty-requests/:id — ویرایش درخواست (فقط admin) */
router.put('/:id', requireRole('admin'), (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const id = Number(req.params.id);
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM warranty_requests WHERE id = ?`).get(id);
  if (!exists) return res.status(404).json({ error: 'درخواست یافت نشد.' });

  let jalali: string | null | undefined;
  let gregorian: string | null | undefined;
  if (b.request_jalali !== undefined) {
    const pair = datePairFromJalali(b.request_jalali || '');
    jalali = pair.jalali;
    gregorian = pair.gregorian;
  }

  db.prepare(`
    UPDATE warranty_requests SET
      description      = COALESCE(?, description),
      status           = COALESCE(?, status),
      request_jalali   = COALESCE(?, request_jalali),
      request_gregorian = COALESCE(?, request_gregorian)
    WHERE id = ?
  `).run(b.description ?? null, b.status ?? null, jalali ?? null, gregorian ?? null, id);
  res.json({ ok: true });
});

/** DELETE /api/warranty-requests/:id (فقط admin) */
router.delete('/:id', requireRole('admin'), (req, res) => {
  getDb().prepare(`DELETE FROM warranty_requests WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
