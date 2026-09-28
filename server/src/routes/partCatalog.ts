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
//   POST   /api/part-catalog/sync          sync دستی (admin)
//   POST   /api/part-catalog/import        آپدیت کاتالوگ از فایل اکسل (admin)
//   POST   /api/part-catalog/import-text   آپدیت کاتالوگ از متن چسبانده‌شده (admin)
// ============================================================
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
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
 * id مرجع برمی‌گرداند.
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
    db.prepare(`UPDATE parts SET catalog_id = ? WHERE catalog_id IN (${ph})`).run(keep_id, ...merge_ids);
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

// ============================================================
// آپدیت کاتالوگ از اکسل یا متن چسبانده‌شده (admin)
// ----------------------------------------------------------------
// قالب ستون‌محور (فهرست انبار):
//   ردیف ۱ عنوان | ردیف ۲ توضیح/مدل | ردیف ۳ پارت‌نامبر | (ردیف ۴+ سریال‌ها نادیده)
// قالب ردیف‌محور (سرستون‌دار):
//   پارت‌نامبر | عنوان قطعه | مشخصات فنی | پارت‌نامبر ۲ (اختیاری) — ترتیب آزاد
// جداکننده‌ی متن: Tab یا | یا ؛ — خودکار تشخیص داده می‌شود.
// رفتار: upsert — مرجع جدید ساخته و مرجع موجود با فیلدهای پرشده‌ی فایل
//        به‌روز می‌شود؛ فیلد خالیِ فایل، مقدار موجود را خراب نمی‌کند؛
//        هیچ رکوردی حذف نمی‌شود. dry_run = پیش‌نمایش بدون نوشتن.
// ============================================================

interface CatalogImportRow { pn: string; title: string; specs: string; pn2: string; }

/** شماره‌ی ستون ۱-مبنا → حرف اکسل (1→A, 27→AA) */
function catalogColLetter(index1: number): string {
  let s = '';
  let n = index1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** آرایه‌ی ردیفی → رکوردهای {A:.., B:..} */
function catalogMatrixToRows(matrix: unknown[][]): Record<string, string>[] {
  return matrix.map((row) => {
    const obj: Record<string, string> = {};
    (row as unknown[]).forEach((v, i) => {
      if (v !== null && v !== undefined && String(v).trim() !== '') obj[catalogColLetter(i + 1)] = String(v).trim();
    });
    return obj;
  });
}

/** تشخیص خودکار جداکننده‌ی متن چسبانده‌شده: Tab (اکسل) یا | یا ؛ */
function catalogDetectDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  const pipes = (firstLine.match(/\|/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (pipes >= 2 && pipes >= semis) return '|';
  if (semis >= 2) return ';';
  return '\t';
}

/**
 * تجزیه‌ی ردیف‌ها به آیتم‌های کاتالوگ — دو قالب:
 *  ۱) ردیف‌محور سرستون‌دار (هدر حاوی «پارت‌نامبر»)
 *  ۲) ستون‌محور فهرست انبار (ردیف ۱ عنوان، ردیف ۲ توضیح، ردیف ۳ پارت‌نامبر)
 */
function parseCatalogRows(rows: Record<string, string>[]): CatalogImportRow[] {
  // ۱) قالب ردیف‌محور
  const headerIdx = rows.findIndex((r) => Object.values(r).some((v) => String(v).trim() === 'پارت‌نامبر'));
  if (headerIdx !== -1) {
    const header = rows[headerIdx];
    const findCol = (...names: string[]): string | null => {
      for (const [letter, value] of Object.entries(header)) {
        if (names.includes(String(value).trim())) return letter;
      }
      return null;
    };
    const pnCol = findCol('پارت‌نامبر', 'پارت‌نامبر ۱', 'پارت‌نامبر اصلی');
    if (pnCol) {
      const titleCol = findCol('عنوان قطعه', 'عنوان', 'عنوان مرجع');
      const specsCol = findCol('مشخصات فنی', 'مشخصات', 'توضیحات', 'توضیح');
      const pn2Col = findCol('پارت‌نامبر ۲', 'پارت‌نامبر دوم', 'PN2');
      const out: CatalogImportRow[] = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const pn = String(r[pnCol] ?? '').trim();
        if (!pn) continue;
        out.push({
          pn,
          title: titleCol ? String(r[titleCol] ?? '').trim() : '',
          specs: specsCol ? String(r[specsCol] ?? '').trim() : '',
          pn2: pn2Col ? String(r[pn2Col] ?? '').trim() : '',
        });
      }
      if (out.length > 0) return out;
    }
  }

  // ۲) قالب ستون‌محور — ردیف هدر پارت‌نامبر خودکار پیدا می‌شود (معمولاً ردیف ۳)
  let pnRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = Object.entries(rows[i] ?? {}).filter(([k]) => k !== 'A');
    if (vals.length < 2) continue;
    let pnLike = 0;
    for (const [, v] of vals) if (/^[A-Za-z0-9][A-Za-z0-9\-_]{3,19}$/.test(v)) pnLike++;
    if (pnLike >= Math.max(2, Math.ceil(vals.length * 0.5))) { pnRowIndex = i; break; }
  }
  if (pnRowIndex >= 2) {
    const headerRow = rows[pnRowIndex - 2] ?? {}; // عنوان (معمولاً ردیف ۱)
    const descRow = rows[pnRowIndex - 1] ?? {};   // توضیح  (معمولاً ردیف ۲)
    const pnRow = rows[pnRowIndex];
    const out: CatalogImportRow[] = [];
    for (const [letter, value] of Object.entries(pnRow)) {
      if (letter === 'A') continue;
      const key = normalizePn(value);
      if (!key) continue;
      out.push({ pn: key, title: String(headerRow[letter] ?? '').trim(), specs: String(descRow[letter] ?? '').trim(), pn2: '' });
    }
    if (out.length > 0) return out;
  }
  return [];
}

interface CatalogImportResult {
  dryRun: boolean;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  created: { part_number_1: string; title: string }[];
  updated: { part_number_1: string; title: string; filled: string[] }[];
  skipped: { pn: string; reason: string }[];
}

/** اجرای upsert آیتم‌های کاتالوگ — در تراکنش؛ dry_run فقط شبیه‌سازی می‌کند */
function applyCatalogUpserts(items: CatalogImportRow[], dryRun: boolean): CatalogImportResult {
  const db = getDb();
  const result: CatalogImportResult = { dryRun, createdCount: 0, updatedCount: 0, skippedCount: 0, created: [], updated: [], skipped: [] };
  const seen = new Set<string>();

  const step = () => {
    for (const it of items) {
      const key = normalizePn(it.pn);
      if (!key) { result.skipped.push({ pn: it.pn, reason: 'پارت‌نامبر نامعتبر/خالی است.' }); continue; }
      if (seen.has(key)) { result.skipped.push({ pn: key, reason: 'در همین فایل تکرار شده — فقط اولین ردیف اعمال شد.' }); continue; }
      seen.add(key);

      const title = it.title?.trim() || '';
      const specs = it.specs?.trim() || '';
      const pn2 = it.pn2?.trim() || '';

      const existing = db.prepare(`SELECT id, title, tech_specs, part_number_2 FROM part_catalog WHERE part_number_1 = ?`).get(key) as
        | { id: number; title: string; tech_specs: string | null; part_number_2: string | null }
        | undefined;

      if (!existing) {
        // مرجع جدید — عنوان اجباری نیست؛ خالی باشد پارت‌نامبر می‌نشیند (قابل ویرایش بعدی)
        if (!dryRun) {
          db.prepare(`INSERT INTO part_catalog (part_number_1, part_number_2, title, tech_specs) VALUES (?, ?, ?, ?)`)
            .run(key, pn2 || null, title || key, specs || null);
        }
        result.created.push({ part_number_1: key, title: title || key });
        continue;
      }

      // مرجع موجود — فقط فیلدهای «پرشده‌ی فایل» به‌روز می‌شوند؛ خالیِ فایل بی‌اثر است
      const filled: string[] = [];
      const newTitle = title && title !== existing.title ? title : null;
      const newSpecs = specs && specs !== (existing.tech_specs ?? '') ? specs : null;
      const newPn2 = pn2 && pn2 !== (existing.part_number_2 ?? '') ? pn2 : null;
      if (newTitle) filled.push('عنوان');
      if (newSpecs) filled.push('مشخصات');
      if (newPn2) filled.push('پارت‌نامبر ۲');
      if (filled.length === 0) {
        result.skipped.push({ pn: key, reason: 'موجود است و فایل مقدار جدیدی برای آن نداشت.' });
        continue;
      }
      if (!dryRun) {
        db.prepare(`
          UPDATE part_catalog SET
            title = COALESCE(?, title),
            tech_specs = COALESCE(?, tech_specs),
            part_number_2 = COALESCE(?, part_number_2),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(newTitle, newSpecs, newPn2, existing.id);
      }
      result.updated.push({ part_number_1: key, title: existing.title, filled });
    }
  };

  if (dryRun) {
    step();
  } else {
    try {
      db.exec('BEGIN');
      step();
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      throw e;
    }
  }

  result.createdCount = result.created.length;
  result.updatedCount = result.updated.length;
  result.skippedCount = result.skipped.length;
  result.skipped = result.skipped.slice(0, 100);
  return result;
}

// ---------- POST /api/part-catalog/import-text — آپدیت از متن چسبانده‌شده (admin) ----------
router.post('/import-text', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const schema = z.object({
      text: z.string().min(1).max(200_000),
      dry_run: z.boolean().optional().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'متن الزامی است.', detail: parsed.error.flatten() });
    const { text, dry_run } = parsed.data;

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) return res.status(400).json({ error: 'متن خالی است.' });
    const delim = catalogDetectDelimiter(lines[0]);
    const rows = lines.map((line) => {
      const obj: Record<string, string> = {};
      line.split(delim).forEach((cell, i) => {
        const v = cell.trim().replace(/^"|"$/g, '');
        if (v) obj[catalogColLetter(i + 1)] = v;
      });
      return obj;
    });

    const items = parseCatalogRows(rows);
    if (items.length === 0) {
      return res.status(400).json({ error: 'قالب شناسایی نشد — سرستون «پارت‌نامبر» یا ردیف‌های عنوان/توضیح/پارت‌نامبر لازم است.' });
    }
    return res.json({ ok: true, result: applyCatalogUpserts(items, dry_run) });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'خطا در پردازش متن.', detail: (err as Error).message });
  }
});

/** جمع‌آوری بدنه‌ی multipart با سقف ۱۰ مگابایت */
function catalogCollectBody(req: Request, res: Response, handle: (body: Buffer, contentType: string) => void): void {
  const chunks: Buffer[] = [];
  let total = 0;
  let aborted = false;
  req.on('data', (c: Buffer) => {
    total += c.length;
    if (total > 10 * 1024 * 1024) { aborted = true; req.destroy(); return; }
    chunks.push(c);
  });
  req.on('error', () => { /* اتصال قطع شد */ });
  req.on('end', () => {
    if (aborted) {
      if (!res.headersSent) res.status(413).json({ error: 'حجم فایل بیش از حد مجاز است (حداکثر ۱۰ مگابایت).' });
      return;
    }
    handle(Buffer.concat(chunks), String(req.headers['content-type'] || ''));
  });
}

/** استخراج فایل و فیلدها از بدنه‌ی multipart دستی */
function catalogParseMultipart(buffer: Buffer, contentType: string): { file: { filename: string; data: Buffer } | null } {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return { file: null };
  const boundary = '--' + (m[1] || m[2]).trim();
  const bBoundary = Buffer.from(boundary);
  const parts: Buffer[] = [];
  let start = buffer.indexOf(bBoundary);
  while (start !== -1) {
    const next = buffer.indexOf(bBoundary, start + bBoundary.length);
    if (next === -1) break;
    parts.push(buffer.subarray(start + bBoundary.length, next));
    start = next;
  }
  let file: { filename: string; data: Buffer } | null = null;
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString('utf-8');
    const body = part.subarray(headerEnd + 4, part.length - 2);
    const nameM = /name="([^"]*)"/i.exec(headers);
    const fileM = /filename="([^"]*)"/i.exec(headers);
    if (!nameM) continue;
    if (fileM && nameM[1] === 'file' && fileM[1] && body.length > 0) file = { filename: fileM[1], data: body };
  }
  return { file };
}

// ---------- POST /api/part-catalog/import — آپدیت از فایل اکسل (admin) ----------
router.post('/import', requireRole('admin'), (req: Request, res: Response) => {
  catalogCollectBody(req, res, (body, contentType) => {
    try {
      const { file } = catalogParseMultipart(body, contentType);
      if (!file || file.data.length === 0) return void res.status(400).json({ error: 'فایل اکسل با نام «file» ارسال نشده است.' });

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(file.data, { type: 'buffer' });
      } catch {
        return void res.status(400).json({ error: 'فایل اکسل قابل خواندن نیست (فرمت xlsx/xls معتبر باشد).' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) return void res.status(400).json({ error: 'فایل اکسل هیچ شیتی ندارد.' });

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null, blankrows: true });
      const items = parseCatalogRows(catalogMatrixToRows(matrix));
      if (items.length === 0) {
        return void res.status(400).json({ error: 'قالب شناسایی نشد — ردیفی از پارت‌نامبرها (ردیف ۳ قالب انبار) یا سرستون «پارت‌نامبر» لازم است.' });
      }

      const dryRun = String(req.headers['x-dry-run'] ?? '') === '1';
      return void res.json({ ok: true, file: file.filename, result: applyCatalogUpserts(items, dryRun) });
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: 'خطا در پردازش فایل.', detail: (err as Error).message });
    }
  });
});

export default router;
