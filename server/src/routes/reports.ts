import { Router } from 'express';
import { getDb } from '../db/db.js';
import { todayJalali, JALALI_MONTHS, jalaliToGregorianISO, gregorianToJalali } from '../lib/date.js';

/**
 * گزارش‌های تحلیلی خرابی و گارنتی.
 */
const router = Router();

/**
 * GET /api/reports/part-replacement-history/:id — تاریخچه‌ی تعویض‌های یک قطعه
 * (چه نقش قدیم چه نقش جدید) با اطلاعات پروژه/دستگاه برای صفحه‌ی جزئیات قطعه.
 */
router.get('/part-replacement-history/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const part = db.prepare(`SELECT id, title, part_serial_number FROM parts WHERE id = ?`).get(id) as
    | { id: number; title: string; part_serial_number: string | null }
    | undefined;
  if (!part) return res.status(404).json({ error: 'قطعه یافت نشد.' });

  const rows = db.prepare(`
    SELECT
      wr.id, wr.replaced_at_jalali, wr.description,
      d.id AS device_id, d.main_serial AS device_serial,
      p.id AS project_id, p.name AS project_name,
      op.id AS old_part_id, op.title AS old_part_title, op.part_serial_number AS old_part_serial,
      np.id AS new_part_id, np.title AS new_part_title, np.part_serial_number AS new_part_serial,
      te.name AS expert_name, fr.name AS failure_reason_name,
      CASE WHEN wr.old_part_id = ? THEN 'old' ELSE 'new' END AS role
    FROM warranty_replacements wr
    LEFT JOIN devices d  ON d.id = wr.device_id
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN parts op   ON op.id = wr.old_part_id
    LEFT JOIN parts np   ON np.id = wr.new_part_id
    LEFT JOIN technical_experts te ON te.id = wr.replaced_by_expert_id
    LEFT JOIN failure_reasons fr  ON fr.id = wr.failure_reason_id
    WHERE wr.old_part_id = ? OR wr.new_part_id = ?
    ORDER BY wr.replaced_at_gregorian DESC
  `).all(id, id, id);

  res.json({ part, count: rows.length, replacements: rows });
});

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

/**
 * ۶) روند ماهانه‌ی تعویض‌ها — ماه‌های شمسی (قدیمی → جدید) با صفرِ ماه‌های خالی.
 * شمارش دقیق: بازه‌ی میلادیِ هر ماه شمسی (ابتدا تا ابتدای ماه بعد) با SQL — بدون خطای مرزی.
 * پارامترها (همه اختیاری):
 *   months=N     تعداد ماه اخیر (پیش‌فرض ۱۲؛ حداکثر ۳۶)
 *   date_from=1404/01/01&date_to=1404/12/29  بازه‌ی صریح شمسی (بر months اولویت دارد؛
 *                ماهِ داخل بازه محاسبه می‌شود — از ماهِ date_from تا ماهِ date_to)
 *   project_id=N فیلتر اختیاری پروژه
 */
router.get('/replacement-trend', (req, res) => {
  const db = getDb();
  const [jy, jm] = todayJalali().split('/').map(Number);

  // بازه: صریح یا N ماه اخیر
  const dateFromRaw = typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '';
  const dateToRaw = typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '';
  let monthsBack = Math.min(36, Math.max(1, Number(req.query.months) || 12));
  let startKey: string;
  let endKey: string;
  if (dateFromRaw || dateToRaw) {
    const gFrom = dateFromRaw ? jalaliToGregorianISO(dateFromRaw) : null;
    const gTo = dateToRaw ? jalaliToGregorianISO(dateToRaw) : null;
    if (dateFromRaw && !gFrom) return res.status(400).json({ error: `تاریخ «از» نامعتبر است: ${dateFromRaw} (قالب 1404/01/01)` });
    if (dateToRaw && !gTo) return res.status(400).json({ error: `تاریخ «تا» نامعتبر است: ${dateToRaw} (قالب 1404/12/29)` });
    if (gFrom && gTo && gFrom > gTo) return res.status(400).json({ error: 'بازه‌ی تاریخ نادرست است — «از» نباید بعد از «تا» باشد.' });
    // ماهِ شروع و ماهِ پایان بر اساس تاریخ شمسی نرمال‌شده
    const fromJ = gFrom ? gregorianToJalali(gFrom)! : null;
    const toJ = gTo ? gregorianToJalali(gTo)! : null;
    const [fy, fm] = fromJ ? fromJ.split('/').map(Number) : [jy, jm];
    const [ty, tm] = toJ ? toJ.split('/').map(Number) : [jy, jm];
    startKey = `${fy}/${String(fm).padStart(2, '0')}`;
    endKey = `${ty}/${String(tm).padStart(2, '0')}`;
    monthsBack = Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
  } else {
    let y = jy, m = jm - (monthsBack - 1);
    while (m <= 0) { m += 12; y -= 1; }
    startKey = `${y}/${String(m).padStart(2, '0')}`;
    endKey = `${jy}/${String(jm).padStart(2, '0')}`;
  }

  // ساخت فهرست ماه‌ها از startKey تا endKey
  const [sy, sm] = startKey.split('/').map(Number);
  const [ey, em] = endKey.split('/').map(Number);
  const months: { key: string; y: number; m: number; label: string }[] = [];
  let cy = sy, cm = sm;
  for (;;) {
    months.push({ key: `${cy}/${String(cm).padStart(2, '0')}`, y: cy, m: cm, label: JALALI_MONTHS[cm - 1] ?? String(cm) });
    if (cy === ey && cm === em) break;
    cm += 1; if (cm > 12) { cm = 1; cy += 1; }
    if (months.length > 60) break; // محافظ
  }

  // فیلتر اختیاری پروژه (دستگاه تعویض‌شده در آن پروژه)
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const projectJoin = projectId ? 'JOIN devices pd ON pd.id = wr.device_id AND pd.project_id = ?' : '';
  const projectParams: number[] = projectId ? [projectId] : [];

  const countByJKey = new Map<string, number>();
  for (const mo of months) {
    const startJ = `${mo.y}/${String(mo.m).padStart(2, '0')}/01`;
    let endY = mo.y, endM = mo.m;
    endM += 1; if (endM > 12) { endM = 1; endY += 1; }
    const endJ = `${endY}/${String(endM).padStart(2, '0')}/01`;
    const gStart = jalaliToGregorianISO(startJ);
    const gEnd = jalaliToGregorianISO(endJ);
    if (!gStart || !gEnd) continue;
    const c = (db.prepare(`
      SELECT COUNT(*) AS c FROM warranty_replacements wr
      ${projectJoin}
      WHERE wr.replaced_at_gregorian >= ? AND wr.replaced_at_gregorian < ?
    `).get(...projectParams, gStart, gEnd) as { c: number }).c;
    countByJKey.set(mo.key, c);
  }

  const trend = months.map((mo) => ({
    year: mo.y,
    month: mo.m,
    label: mo.label,
    count: countByJKey.get(mo.key) ?? 0,
  }));
  const total = trend.reduce((s, m) => s + m.count, 0);
  res.json({ months: trend, total, since: startKey, until: endKey, monthsBack, projectId });
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
