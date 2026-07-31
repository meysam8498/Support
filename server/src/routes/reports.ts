import { Router } from 'express';
import { getDb } from '../db/db.js';

/**
 * گزارش‌های تحلیلی خرابی و گارنتی.
 */
const router = Router();

/** ۱) قطعاتی که بیشترین خرابی دارند (بر اساس تعداد تعویض) */
router.get('/most-failed-parts', (req, res) => {
  const db = getDb();
  const limit = Number(req.query.limit) || 20;

  // بر اساس عنوان قطعه + پارت‌نامبر اول (دسته‌بندی منطقی)
  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(op.title, ''), '(بدون عنوان)') AS part_title,
      op.part_number_1,
      COUNT(*) AS replacement_count,
      COUNT(DISTINCT wr.device_id) AS affected_devices
    FROM warranty_replacements wr
    LEFT JOIN parts op ON op.id = wr.old_part_id
    GROUP BY part_title, op.part_number_1
    ORDER BY replacement_count DESC
    LIMIT ?
  `).all(limit);

  res.json(rows);
});

/** ۲) تحلیل خرابی بر اساس مشتری (کدام مشتری بیشترین مطالبات دارد) */
router.get('/failures-by-customer', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      COUNT(wr.id) AS claims_count,
      COUNT(DISTINCT wr.device_id) AS affected_devices,
      COUNT(DISTINCT wr.failure_reason_id) AS distinct_failures
    FROM projects p
    LEFT JOIN devices d ON d.project_id = p.id
    LEFT JOIN warranty_replacements wr ON wr.device_id = d.id
    GROUP BY p.id
    HAVING claims_count > 0
    ORDER BY claims_count DESC
  `).all();
  res.json(rows);
});

/** ۳) تحلیل خرابی بر اساس دلیل/نوع خرابی */
router.get('/failures-by-reason', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      fr.id AS failure_reason_id,
      fr.name AS failure_reason_name,
      COUNT(wr.id) AS replacement_count,
      COUNT(DISTINCT wr.device_id) AS affected_devices,
      COUNT(DISTINCT d.project_id) AS affected_customers
    FROM failure_reasons fr
    LEFT JOIN warranty_replacements wr ON wr.failure_reason_id = fr.id
    LEFT JOIN devices d ON d.id = wr.device_id
    GROUP BY fr.id
    HAVING replacement_count > 0
    ORDER BY replacement_count DESC
  `).all();
  res.json(rows);
});

/** ۴) نیاز به خدمات تعمیر و گارنتی برای هر دسته‌بندی (نوع دستگاه) */
router.get('/service-needs-by-type', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      dt.id AS device_type_id,
      dt.name AS device_type_name,
      COUNT(DISTINCT d.id) AS total_devices,
      COUNT(DISTINCT p.id) AS total_parts,
      COUNT(DISTINCT wr.id) AS total_replacements,
      ROUND(
        CASE WHEN COUNT(DISTINCT d.id) > 0
             THEN COUNT(DISTINCT wr.id) * 1.0 / COUNT(DISTINCT d.id)
             ELSE 0 END,
        2
      ) AS replacements_per_device
    FROM device_types dt
    LEFT JOIN devices d ON d.device_type_id = dt.id
    LEFT JOIN parts p ON p.device_id = d.id
    LEFT JOIN warranty_replacements wr ON wr.device_id = d.id
    GROUP BY dt.id
    ORDER BY total_replacements DESC, replacements_per_device DESC
  `).all();
  res.json(rows);
});

/** ۵) خلاصه جامع برای داشبورد گزارش‌ها */
router.get('/summary', (_req, res) => {
  const db = getDb();
  const summary = {
    totalReplacements: (db.prepare(`SELECT COUNT(*) AS c FROM warranty_replacements`).get() as { c: number }).c,
    totalParts: (db.prepare(`SELECT COUNT(*) AS c FROM parts`).get() as { c: number }).c,
    replacedParts: (db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE status = 'replaced'`).get() as { c: number }).c,
    activeParts: (db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE status = 'active'`).get() as { c: number }).c,
    customersWithClaims: (db.prepare(`
      SELECT COUNT(DISTINCT d.project_id) AS c
      FROM warranty_replacements wr JOIN devices d ON d.id = wr.device_id
    `).get() as { c: number }).c,
    // بیشترین خرابی در یک ماه شمسی اخیر
    recentReplacements: db.prepare(`
      SELECT wr.replaced_at_jalali, op.title AS part_title, p.name AS project_name
      FROM warranty_replacements wr
      LEFT JOIN parts op ON op.id = wr.old_part_id
      LEFT JOIN devices d ON d.id = wr.device_id
      LEFT JOIN projects p ON p.id = d.project_id
      ORDER BY wr.replaced_at_gregorian DESC
      LIMIT 5
    `).all(),
  };
  res.json(summary);
});

export default router;
