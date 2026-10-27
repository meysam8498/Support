import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { authRequired } from '../middleware/auth.js';

/**
 * داشبورد یکپارچه — نگاه جامع بر اساس موجودیت‌های مختلف.
 */
const router = Router();

// ============================================================
// چیدمان داشبورد کاربر (۱.۳۲) — همگام بین دستگاه‌ها و نشست‌ها
// ------------------------------------------------------------
// منبع حقیقت، سرور است: تخته‌ی ویجت‌ها پس از رندر، چیدمان را از همین‌جا
// می‌خواند و هر تغییر را اینجا می‌نویسد؛ localStorage فقط «پنهانگاه» همان
// نسخه برای نمایش فوری و کارکرد آفلاین است.
//
// طراحی:
//   • جداسازی per-user از راهِ هویت نشست (req.user.sub) — نه ورودی کلاینت؛
//     کاربر نمی‌تواند چیدمان کاربر دیگر را بخواند/بنویسد.
//   • اعتبارسنجی سمت سرور با zod: هر id باید یکی از ویجت‌های شناخته‌شده باشد،
//     ترتیب بدون تکرار و جایگشت کامل DEFAULT_ORDER باشد؛ مخفی‌ها زیرمجموعه‌اش.
//     ولیداسیون کلاینت قابل‌اعتماد نیست — اینجا هم اعمال می‌شود.
//   • no-store روی هر دو مسیر: چیدمان داده‌ی شخصی و زنده است؛ کش میان‌افزار
//     نباید نسخه‌ی کهنه را برگرداند.
//   • حل تداخل آخرین-نویسنده-برنده با مقایسه‌ی updated_at: کلاینت تغییرش را با
//     زمان سرورِ هنگام خواندن می‌فرستد؛ اگر ردیف از آن زمان جلوتر رفته باشد
//     (نشست دیگری روی دستگاه دیگر) ۴۰۹ برمی‌گردد تا کلاینت تصمیم بگیرد.
//     این به‌جای «بی‌صدا بازنویسی» است که باعث می‌شد تغییر یک دستگاه بی‌دلیل
//     تغییر دستگاه دیگر را بپوشاند.
// ============================================================

/** ویجت‌های شناخته‌شده‌ی داشبورد — باید با DEFAULT_ORDER کلاینت یکی باشد */
const WIDGET_IDS = [
  'welcome', 'backup', 'license', 'stats', 'progress', 'trend',
  'topParts', 'quickReport', 'recent', 'projects', 'actions',
] as const;
const WIDGET_ID_SET = new Set<string>(WIDGET_IDS);

/** پیکربندی یکسان‌سازی با اعتبارسنجی کلاینت (منطق واحد: همان normalizeLayout) */
const widgetId = z.string().refine((v) => WIDGET_ID_SET.has(v), {
  message: `شناسه‌ی ویجت ناشناخته است — مجاز: ${WIDGET_IDS.join(', ')}`,
});

/** هر دو آرایه باید جایگشت کاملی از همه‌ی ویجت‌ها باشند (بدون تکرار/حذف) */
const orderSchema = z.array(widgetId).length(WIDGET_IDS.length).refine(
  (arr) => new Set(arr).size === WIDGET_IDS.length,
  { message: 'ترتیب باید دقیقاً یک جایگشت کامل از همه‌ی ویجت‌ها باشد (بدون تکرار).' },
);
const hiddenSchema = z.array(widgetId).refine(
  (arr) => new Set(arr).size === arr.length,
  { message: 'فهرست ویجت‌های مخفی‌شده نباید تکراری باشد.' },
);

const layoutBodySchema = z.object({
  order: orderSchema,
  hidden: hiddenSchema,
  /** updated_at سرور هنگام خواندن — پایه‌ی تشخیص تداخل (اختیاری: نوشتن نخستین) */
  base_updated_at: z.string().min(1).optional(),
});

interface LayoutRow {
  user_id: number;
  layout: string;
  updated_at: string;
}

/**
 * زمان SQLite («YYYY-MM-DD HH:MM:SS» به وقت UTC، بدون Z) → ISO8601 کامل.
 * هم مقایسه‌ی تداخل و هم پاسخ به کلاینت از همین فرمت استفاده می‌کنند، چون
 * فرمت خامِ Z-less (جایگزینی فضای خالی با T) با ISO پایه‌ی کلاینت قابل
 * مقایسه نیست و تازگی را به‌اشتباه می‌شکست — حالا هر دو طرف ISO‌اند.
 */
function toIso(stamp: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)) return `${stamp.replace(' ', 'T')}Z`;
  return stamp; // از قبل ISO است (fallback هنگام حذف)
}

/**
 * GET /api/dashboard/layout — چیدمان کاربرِ واردشده.
 * اگر هنوز چیزی ذخیره نشده باشد ۴۰۴ برمی‌گردد تا کلاینت از DEFAULT_ORDER
 * استفاده کند؛ ولی همیشه updated_at می‌دهد (برای ردیف تازه = زمان حال).
 */
router.get('/layout', authRequired, (req, res) => {
  const userId = req.user!.sub;
  const row = getDb()
    .prepare(`SELECT user_id, layout, updated_at FROM user_dashboard_layouts WHERE user_id = ?`)
    .get(userId) as LayoutRow | undefined;

  res.setHeader('Cache-Control', 'no-store');
  if (!row) {
    return res.status(404).json({ error: 'چیدمانی برای این کاربر ذخیره نشده است.', updated_at: new Date().toISOString() });
  }

  let layout: { order?: unknown; hidden?: unknown };
  try {
    layout = JSON.parse(row.layout);
  } catch {
    // داده‌ی خراب در DB (دستی/نشست ناقص) — بی‌صدا پیش‌فرض برگردان، نه۵۰۰
    console.error(`⚠ چیدمان کاربر ${userId} قابل خواندن نیست — پیش‌فرض برگردانده شد.`);
    layout = {};
  }

  return res.json({
    order: Array.isArray(layout.order) ? layout.order : [],
    hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
    updated_at: toIso(row.updated_at),
  });
});

/**
 * PUT /api/dashboard/layout — ذخیره‌ی چیدمان کاربر واردشده (upsert).
 * ۴۰۹ وقتی که ردیف از base_updated_at جلوتر رفته باشد — یعنی نشست دیگری
 * (روی دستگاه دیگر) وسطِ کار تغییرش کرده و اینجا بازنویسیِ بی‌صدا نداریم.
 */
router.put('/layout', authRequired, (req, res) => {
  const userId = req.user!.sub;
  const parsed = layoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first.message, path: first.path.join('.') });
  }
  const { order, hidden, base_updated_at } = parsed.data;
  const db = getDb();

  const existing = db
    .prepare(`SELECT user_id, layout, updated_at FROM user_dashboard_layouts WHERE user_id = ?`)
    .get(userId) as LayoutRow | undefined;

  // حل تداخل: فقط وقتی کلاینت زمان خواندن را فرستاده باشد و ردیف از آن جلوتر باشد.
  // مقایسه باید ISO در برابر ISO باشد — فرمت خام SQLite با Z-less فضای خالی
  // جایگزین T می‌دهد و رشته‌ی مقایسه را می‌شکست (تازگی به‌اشتباه قدیمی/جدید می‌شد).
  if (base_updated_at && existing && toIso(existing.updated_at) > base_updated_at) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(409).json({
      error: 'چیدمان این کاربر روی دستگاه دیگری تغییر کرده است.',
      conflict: true,
      current: (() => {
        const stamp = toIso(existing.updated_at);
        try {
          const p = JSON.parse(existing.layout) as { order?: unknown; hidden?: unknown };
          return { order: Array.isArray(p.order) ? p.order : [], hidden: Array.isArray(p.hidden) ? p.hidden : [], updated_at: stamp };
        } catch {
          return { order: [], hidden: [], updated_at: stamp };
        }
      })(),
    });
  }

  const layout = JSON.stringify({ order, hidden });
  db.prepare(`
    INSERT INTO user_dashboard_layouts (user_id, layout, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at
  `).run(userId, layout);

  const saved = db
    .prepare(`SELECT user_id, layout, updated_at FROM user_dashboard_layouts WHERE user_id = ?`)
    .get(userId) as LayoutRow | undefined;

  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, order, hidden, updated_at: saved ? toIso(saved.updated_at) : new Date().toISOString() });
});

/**
 * DELETE /api/dashboard/layout — بازگشت به پیش‌فرض؛ ردیف را حذف می‌کند تا
 * کلاینت‌ها همگی از DEFAULT_ORDER شروع کنند (همان «بازگشت به پیش‌فرض» تخته).
 */
router.delete('/layout', authRequired, (req, res) => {
  const userId = req.user!.sub;
  getDb().prepare(`DELETE FROM user_dashboard_layouts WHERE user_id = ?`).run(userId);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, deleted: true, updated_at: new Date().toISOString() });
});

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
