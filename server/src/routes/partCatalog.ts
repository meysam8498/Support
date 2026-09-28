// ============================================================
// کاتالوگ قطعات — تعریف مرجع یکتا برای هر مدل قطعه (پارت‌نامبر)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// هدف: توضیحات غیریکسان و خطای ورودی صفر شود — کمترین ورودی، همه‌چیز از لیست.
//   GET    /api/part-catalog?q=            فهرست/جست‌وجوی مراجع
//   GET    /api/part-catalog/lookup?pn=    گرفتن مرجع با پارت‌نامبر
//   POST   /api/part-catalog               ساخت مرجع جدید (admin)
//   PUT    /api/part-catalog/:id           ویرایش مرجع + sync همه‌ی قطعات وصل (admin)
//   POST   /api/part-catalog/merge         ادغام چند مرجع (مثلاً پس از اصلاح PN) (admin)
//   POST   /api/part-catalog/sync          sync دستی (admin) — ارسال مجدد نیاز نیست
// ============================================================
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

/** نرمال‌سازی پارت‌نامبر به‌عنوان کلید یکتا: حذف فاصله + حروف بزرگ + ارقام لاتین */
export function normalizePn(pn: string): string {
  return String(pn ?? '')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/\s+/g, '')
    .toUpperCase()
    .trim();
}

/**
 * پیدا کردن یا ساختن مرجع کاتالوگ برای یک پارت‌نامبر.
 * اگر مرجع موجود باشد و ورودی title/specs داده شده باشد، مرجع غنی‌تر می‌شود
 * (فیلدهای خالی مرجع پر می‌شوند) تا توضیحات بین قطعات ناهمگون نشود.
 * id مرجع برمی‌گردد.
 */
export function upsertCatalogEntry(
  db: ReturnType<typeof getDb>,
  pn: string,
  input: { title?: string; tech_specs?: string | null; part_number_2?: string | null } = {},
): number {
  const key = normalizePn(pn);
  if (!key) return 0;

  const existing = db.prepare(`SELECT id, title, tech_specs, part_number_2 FROM part_catalog WHERE part_number_1 = ?`).get(key) as
    | { id: number; title: string; tech_specs: string | null; part_number_2: string | null }
    | undefined;

  if (existing) {
    // غنی‌سازی: فقط فیلدهای خالی مرجع از ورودی پر می‌شوند — مقدار مرجع حرف آخر است
    const title = input.title?.trim();
    const specs = input.tech_specs?.trim();
    const pn2 = input.part_number_2?.trim();
    if ((title && title !== existing.title) || (specs && !existing.tech_specs) || (pn2 && !existing.part_number_2)) {
      db.prepare(`
        UPDATE part_catalog SET
          title = ?,
          tech_specs = COALESCE(tech_specs, ?),
          part_number_2 = COALESCE(part_number_2, ?),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(existing.title, specs || null, pn2 || null, existing.id);
    }
    return existing.id;
  }

  const info = db.prepare(`
    INSERT INTO part_catalog (part_number_1, part_number_2, title, tech_specs)
    VALUES (?, ?, ?, ?)
  `).run(
    key,
    input.part_number_2?.trim() || null,
    input.title?.trim() || key,
    input.tech_specs?.trim() || null,
  );
  return Number(info.lastInsertRowid);
}

/**
 * اتصال قطعات بدون کاتالوگ (مثلاً پس از import اکسل) به مراجع موجود/جدید
 * و یکسان‌سازی عنوان/توضیح آن‌ها با مرجع. برمی‌گرداند تعداد اتصال‌ها.
 */
export function syncPartsToCatalog(db: ReturnType<typeof getDb>): number {
  const unlinked = db.prepare(`
    SELECT id, title, tech_specs, part_number_1, part_number_2
    FROM parts
    WHERE catalog_id IS NULL AND COALESCE(part_number_1, '') != ''
  `).all() as { id: number; title: string; tech_specs: string | null; part_number_1: string; part_number_2: string | null }[];

  let linked = 0;
  for (const p of unlinked) {
    const catalogId = upsertCatalogEntry(db, p.part_number_1, {
      title: p.title,
      tech_specs: p.tech_specs,
      part_number_2: p.part_number_2,
    });
    const ref = db.prepare(`SELECT title, tech_specs FROM part_catalog WHERE id = ?`).get(catalogId) as { title: string; tech_specs: string | null } | undefined;
    if (ref) {
      db.prepare(`UPDATE parts SET catalog_id = ?, title = ?, tech_specs = ? WHERE id = ?`).run(catalogId, ref.title, ref.tech_specs, p.id);
      linked++;
    }
  }
  return linked;
}

// ---------- GET /api/part-catalog?q= ----------
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const q = String(req.query.q ?? '').trim();
  const like = `%${q.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;
  const whereSql = q ? `WHERE pc.title LIKE ? ESCAPE '\\' OR pc.part_number_1 LIKE ? ESCAPE '\\' OR pc.part_number_2 LIKE ? ESCAPE '\\'` : '';
  const params = q ? [like, like, like] : [];

  interface CatalogListRow {
    id: number; part_number_1: string; part_number_2: string | null;
    title: string; tech_specs: string | null; notes: string | null;
    installed_count: number;
  }
  const rows = db.prepare(`
    SELECT pc.*,
           (SELECT COUNT(*) FROM parts p WHERE p.catalog_id = pc.id) AS installed_count
    FROM part_catalog pc
    ${whereSql}
    ORDER BY pc.title
    LIMIT 200
  `).all(...params) as unknown as CatalogListRow[];

  // رتبه‌بندی: تطبیق «کل عبارت با ابتدای PN1/PN2» بالاتر از تطبیق جزئی است —
  // تا تایپ پارت‌نامبر دوم هم مرجع درست را بالای لیست بیاورد.
  const key = q.replace(/\s+/g, '').toUpperCase();
  const rank = (r: { part_number_1: string; part_number_2: string | null }): number => {
    const pn1 = (r.part_number_1 || '').replace(/\s+/g, '').toUpperCase();
    const pn2 = (r.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
    if (pn2 === key || pn1 === key) return 0;           // تطبیق کامل
    if (pn2.startsWith(key) || pn1.startsWith(key)) return 1; // ابتدای PN
    return 2;                                            // تطبیق جزئی/عنوان
  };
  rows.sort((a: CatalogListRow, b: CatalogListRow) => rank(a) - rank(b) || a.title.localeCompare(b.title));

  res.json(rows);
});

// ---------- GET /api/part-catalog/lookup?pn= ----------
router.get('/lookup', (req: Request, res: Response) => {
  const db = getDb();
  const key = normalizePn(String(req.query.pn ?? ''));
  if (!key) return res.status(400).json({ error: 'پارت‌نامبر الزامی است.' });
  const entry = db.prepare(`
    SELECT pc.*,
           (SELECT COUNT(*) FROM parts p WHERE p.catalog_id = pc.id) AS installed_count
    FROM part_catalog pc WHERE pc.part_number_1 = ?
  `).get(key);
  return res.json(entry ?? null);
});

// ---------- GET /api/part-catalog/:id — یک مرجع (برای بج فیلتر) ----------
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = Number(req.params.id);
  const entry = db.prepare(`
    SELECT pc.*,
           (SELECT COUNT(*) FROM parts p WHERE p.catalog_id = pc.id) AS installed_count
    FROM part_catalog pc WHERE pc.id = ?
  `).get(id);
  if (!entry) return res.status(404).json({ error: 'مرجع یافت نشد.' });
  return res.json(entry);
});

const catalogSchema = z.object({
  part_number_1: z.string().min(1).max(120),
  part_number_2: z.string().max(120).optional().nullable(),
  title: z.string().min(1).max(200),
  tech_specs: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ---------- POST /api/part-catalog — ساخت مرجع جدید (admin) ----------
router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = catalogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const c = parsed.data;
  const key = normalizePn(c.part_number_1);
  const db = getDb();
  const dup = db.prepare(`SELECT id FROM part_catalog WHERE part_number_1 = ?`).get(key);
  if (dup) return res.status(409).json({ error: 'مرجعی با این پارت‌نامبر از قبل موجود است.' });

  const info = db.prepare(`
    INSERT INTO part_catalog (part_number_1, part_number_2, title, tech_specs, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, c.part_number_2 || null, c.title.trim(), c.tech_specs || null, c.notes || null);
  return res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// ---------- PUT /api/part-catalog/:id — ویرایش کامل مرجع + sync همه (admin) ----------
// همه‌ی فیلدها قابل ویرایش‌اند: پارت‌نامبر ۱ و ۲، عنوان، مشخصات، یادداشت.
// تغییر پارت‌نامبر مرجع = تغییر پارت‌نامبر همه‌ی قطعات وصل (فقط سریال نمونه‌ها مستقل می‌ماند).
router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = catalogSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const c = parsed.data;
  const db = getDb();
  const id = Number(req.params.id);
  const entry = db.prepare(`SELECT id, part_number_1, part_number_2 FROM part_catalog WHERE id = ?`).get(id) as
    | { id: number; part_number_1: string; part_number_2: string | null }
    | undefined;
  if (!entry) return res.status(404).json({ error: 'مرجع یافت نشد.' });

  // تغییر پارت‌نامبر ۱؟ — نرمال‌سازی + بررسی تکراری نبودن
  let newKey: string | null = null;
  if (c.part_number_1 !== undefined) {
    newKey = normalizePn(c.part_number_1);
    if (!newKey) return res.status(400).json({ error: 'پارت‌نامبر نمی‌تواند خالی باشد.' });
    if (newKey !== entry.part_number_1) {
      const dup = db.prepare(`SELECT id FROM part_catalog WHERE part_number_1 = ? AND id != ?`).get(newKey, id);
      if (dup) return res.status(409).json({ error: 'مرجع دیگری با این پارت‌نامبر موجود است — ابتدا دو مرجع را ادغام کنید.' });
    }
  }

  // پارت‌نامبر ۲: مقدار صریح (حتی رشته‌ی خالی = پاک کردن)
  const pn2 = c.part_number_2 !== undefined ? (c.part_number_2?.trim() || null) : undefined;

  const run = () => {
    db.prepare(`
      UPDATE part_catalog SET
        part_number_1 = COALESCE(?, part_number_1),
        part_number_2 = COALESCE(?, part_number_2),
        title = COALESCE(?, title),
        tech_specs = COALESCE(?, tech_specs),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newKey, pn2 ?? null, c.title?.trim() ?? null, c.tech_specs?.trim() ?? null, c.notes?.trim() ?? null, id);
    // پاک کردن صریح pn2 وقتی رشته‌ی خالی فرستاده شده
    if (pn2 === null) db.prepare(`UPDATE part_catalog SET part_number_2 = NULL WHERE id = ?`).run(id);

    // sync کامل: پارت‌نامبر ۱ و ۲ + عنوان + توضیح همه‌ی قطعات وصل از مرجع — سریال نمونه دست نمی‌خورد
    db.prepare(`
      UPDATE parts SET
        part_number_1 = (SELECT part_number_1 FROM part_catalog WHERE id = ?),
        part_number_2 = (SELECT part_number_2 FROM part_catalog WHERE id = ?),
        title = (SELECT title FROM part_catalog WHERE id = ?),
        tech_specs = (SELECT tech_specs FROM part_catalog WHERE id = ?)
      WHERE catalog_id = ?
    `).run(id, id, id, id, id);
  };

  try {
    db.exec('BEGIN');
    run();
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    return res.status(400).json({ error: (e as Error).message || 'ویرایش ناموفق بود.' });
  }

  res.json({ ok: true, synced: (db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE catalog_id = ?`).get(id) as { c: number }).c });
});

// ---------- POST /api/part-catalog/merge — ادغام مراجع (admin) ----------
router.post('/merge', requireRole('admin'), (req: Request, res: Response) => {
  const schema = z.object({
    keep_id: z.number().int().positive(),   // مرجعی که می‌ماند (حرف آخر)
    merge_ids: z.array(z.number().int().positive()).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی نامعتبر است.' });

  const db = getDb();
  const { keep_id, merge_ids } = parsed.data;
  if (merge_ids.includes(keep_id)) return res.status(400).json({ error: 'مرجع نگه‌داشتنی در لیست ادغام است.' });

  try {
    db.exec('BEGIN');
    // قطعات وصل به مراجعِ ادغام‌شونده به مرجع اصلی منتقل می‌شوند
    const ph = merge_ids.map(() => '?').join(',');
    db.exec(`
      UPDATE parts SET catalog_id = ${keep_id}
      WHERE catalog_id IN (${ph})
    `.replace(/\s+/g, ' '));
    db.prepare(`DELETE FROM part_catalog WHERE id IN (${ph})`).run(...merge_ids);
    // یکسان‌سازی نهایی قطعات وصل به مرجع اصلی
    db.prepare(`
      UPDATE parts SET
        title = (SELECT title FROM part_catalog WHERE id = ?),
        tech_specs = (SELECT tech_specs FROM part_catalog WHERE id = ?)
      WHERE catalog_id = ?
    `).run(keep_id, keep_id, keep_id);
    db.exec('COMMIT');
    const synced = (db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE catalog_id = ?`).get(keep_id) as { c: number }).c;
    return res.json({ ok: true, synced });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    return res.status(400).json({ error: (e as Error).message || 'ادغام ناموفق بود.' });
  }
});

// ---------- POST /api/part-catalog/sync — اتصال قطعات بدون مرجع + یکسان‌سازی (admin) ----------
router.post('/sync', requireRole('admin'), (_req: Request, res: Response) => {
  const db = getDb();
  const linked = syncPartsToCatalog(db);
  const aligned = db.prepare(`
    UPDATE parts SET
      title = COALESCE((SELECT title FROM part_catalog WHERE id = parts.catalog_id), title),
      tech_specs = COALESCE((SELECT tech_specs FROM part_catalog WHERE id = parts.catalog_id), tech_specs)
    WHERE catalog_id IS NOT NULL
  `).run();
  res.json({ ok: true, linked, aligned: aligned.changes });
});

export default router;
