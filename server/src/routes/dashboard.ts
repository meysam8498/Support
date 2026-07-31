import { Router } from 'express';
import { getDb } from '../db/db.js';

/**
 * داشبورد یکپارچه — نگاه جامع بر اساس موجودیت‌های مختلف.
 */
const router = Router();

/** آمار کلی بالای داشبورد */
router.get('/stats', (_req, res) => {
  const db = getDb();
  const stats = {
    devices: (db.prepare(`SELECT COUNT(*) AS c FROM devices`).get() as { c: number }).c,
    parts: (db.prepare(`SELECT COUNT(*) AS c FROM parts`).get() as { c: number }).c,
    activeParts: (db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE status = 'active'`).get() as { c: number }).c,
    replacements: (db.prepare(`SELECT COUNT(*) AS c FROM warranty_replacements`).get() as { c: number }).c,
    projects: (db.prepare(`SELECT COUNT(*) AS c FROM projects`).get() as { c: number }).c,
  };
  res.json(stats);
});

/**
 * GET /api/dashboard/by-customer?project_id=X
 * همه موارد مرتبط با یک مشتری (پروژه): دستگاه‌ها، قطعات، سابقه خدمات.
 */
router.get('/by-customer', (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId) return res.status(400).json({ error: 'project_id الزامی است.' });
  const db = getDb();

  const project = db.prepare(`
    SELECT p.*, e.name AS sales_expert_name
    FROM projects p LEFT JOIN sales_experts e ON e.id = p.sales_expert_id
    WHERE p.id = ?
  `).get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const devices = db.prepare(`
    SELECT d.*, dt.name AS device_type_name, dm.name AS device_model_name,
           b.name AS brand_name, te.name AS technical_expert_name,
           se.name AS sales_expert_name,
           (SELECT COUNT(*) FROM parts WHERE device_id = d.id) AS parts_count,
           (SELECT COUNT(*) FROM warranty_replacements WHERE device_id = d.id) AS replacements_count
    FROM devices d
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN device_models dm ON dm.id = d.device_model_id
    LEFT JOIN brands b ON b.id = d.brand_id
    LEFT JOIN technical_experts te ON te.id = d.technical_expert_id
    LEFT JOIN sales_experts se ON se.id = d.sales_expert_id
    WHERE d.project_id = ?
    ORDER BY d.created_at DESC
  `).all(projectId);

  const parts = db.prepare(`
    SELECT p.*, d.main_serial AS device_serial, d.id AS device_id,
           dt.name AS device_type_name
    FROM parts p
    JOIN devices d ON d.id = p.device_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    WHERE d.project_id = ?
    ORDER BY p.created_at DESC
  `).all(projectId);

  const services = db.prepare(`
    SELECT wr.*, d.main_serial AS device_serial, d.id AS device_id,
           op.title AS old_part_title, np.title AS new_part_title,
           te.name AS expert_name, fr.name AS failure_reason_name
    FROM warranty_replacements wr
    JOIN devices d ON d.id = wr.device_id
    LEFT JOIN parts op ON op.id = wr.old_part_id
    LEFT JOIN parts np ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr ON fr.id = wr.failure_reason_id
    WHERE d.project_id = ?
    ORDER BY wr.replaced_at_gregorian DESC
  `).all(projectId);

  return res.json({ project, devices, parts, services });
});

/**
 * GET /api/dashboard/by-expert?expert_type=sales|technical&expert_id=X
 * همه موارد مرتبط با یک کارشناس فروش یا فنی.
 */
router.get('/by-expert', (req, res) => {
  const expertType = String(req.query.expert_type); // sales | technical
  const expertId = Number(req.query.expert_id);
  if (!expertId || !['sales', 'technical'].includes(expertType)) {
    return res.status(400).json({ error: 'expert_type و expert_id الزامی است.' });
  }
  const column = expertType === 'sales' ? 'sales_expert_id' : 'technical_expert_id';
  const db = getDb();

  const expert = db.prepare(
    expertType === 'sales'
      ? `SELECT id, name, phone FROM sales_experts WHERE id = ?`
      : `SELECT id, name, phone FROM technical_experts WHERE id = ?`
  ).get(expertId);
  if (!expert) return res.status(404).json({ error: 'کارشناس یافت نشد.' });

  const devices = db.prepare(`
    SELECT d.*, p.name AS project_name, dt.name AS device_type_name,
           dm.name AS device_model_name, b.name AS brand_name,
           (SELECT COUNT(*) FROM parts WHERE device_id = d.id) AS parts_count,
           (SELECT COUNT(*) FROM warranty_replacements WHERE device_id = d.id) AS replacements_count
    FROM devices d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN device_models dm ON dm.id = d.device_model_id
    LEFT JOIN brands b ON b.id = d.brand_id
    WHERE d.${column} = ?
    ORDER BY d.created_at DESC
  `).all(expertId);

  let services: unknown[] = [];
  if (expertType === 'technical') {
    services = db.prepare(`
      SELECT wr.*, d.main_serial AS device_serial, p.name AS project_name,
             op.title AS old_part_title, np.title AS new_part_title,
             fr.name AS failure_reason_name
      FROM warranty_replacements wr
      JOIN devices d ON d.id = wr.device_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN parts op ON op.id = wr.old_part_id
      LEFT JOIN parts np ON np.id = wr.new_part_id
      LEFT JOIN failure_reasons fr ON fr.id = wr.failure_reason_id
      WHERE wr.replaced_by_expert_id = ?
      ORDER BY wr.replaced_at_gregorian DESC
    `).all(expertId);
  }

  return res.json({ expert: { ...expert as object, type: expertType }, devices, services });
});

/** مسیر کامل یک قطعه: timeline از فروش تا تعویض‌های گارنتی */
router.get('/part-trace/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();

  const root = db.prepare(`
    WITH RECURSIVE origin AS (
      SELECT id, replaces_part_id FROM parts WHERE id = ?
      UNION ALL
      SELECT p.id, p.replaces_part_id FROM parts p JOIN origin o ON p.id = o.replaces_part_id
    )
    SELECT id FROM origin WHERE replaces_part_id IS NULL LIMIT 1
  `).get(id) as { id: number } | undefined;

  if (!root) return res.status(404).json({ error: 'قطعه یافت نشد.' });

  const chain = db.prepare(`
    WITH RECURSIVE chain AS (
      SELECT id, replaces_part_id, 0 AS depth FROM parts WHERE id = ?
      UNION ALL
      SELECT c2.id, c2.replaces_part_id, ch.depth + 1
      FROM parts c2 JOIN chain ch ON c2.replaces_part_id = ch.id
    )
    SELECT p.id, p.title, p.part_serial_number, p.status,
           p.sold_at_jalali, p.sold_at_gregorian, p.created_at,
           d.id AS device_id, d.main_serial AS device_serial
    FROM chain ch
    JOIN parts p ON p.id = ch.id
    LEFT JOIN devices d ON d.id = p.device_id
    ORDER BY ch.depth
  `).all(root.id);

  const chainIds = (chain as { id: number }[]).map((c) => c.id);
  const placeholders = chainIds.map(() => '?').join(',');
  const replacements = chainIds.length
    ? (db.prepare(`
        SELECT wr.*, op.title AS old_part_title, np.title AS new_part_title,
               te.name AS expert_name, fr.name AS failure_reason_name
        FROM warranty_replacements wr
        LEFT JOIN parts op ON op.id = wr.old_part_id
        LEFT JOIN parts np ON np.id = wr.new_part_id
        LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
        LEFT JOIN failure_reasons fr ON fr.id = wr.failure_reason_id
        WHERE wr.old_part_id IN (${placeholders})
        ORDER BY wr.replaced_at_gregorian ASC
      `).all(...chainIds))
    : [];

  return res.json({ rootPartId: root.id, chain, replacements });
});

export default router;
