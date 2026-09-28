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
import jalaali from 'jalaali-js';
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

// ---------- GET /api/part-catalog/template — دانلود قالب اکسل آپدیت کاتالوگ (admin) ----------
// شیت ۱ «کاتالوگ»: سرستون‌ها + ردیف‌های نمونه — پارسر import-text/import همین سرستون‌ها را می‌خواند
// شیت ۲ «راهنما»: توضیح فارسی ستون‌ها و قواعد upsert
router.get('/template', requireRole('admin'), (_req: Request, res: Response) => {
  const j = jalaali.toJalaali(new Date());
  const today = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;

  const headers = ['پارت‌نامبر', 'عنوان قطعه', 'مشخصات فنی', 'پارت‌نامبر ۲'];
  const sample = [
    ['840758-001', '32GB DDR4 RDIMM', 'PC4-2666V ECC Registered', '840758-B21'],
    ['P19776-B21', 'PSU 800W', '800W Platinum Redundant', ''],
    ['781518-B21', '1TB SAS 10K', '2.5in SAS', ''],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 30 }, { wch: 16 }];
  ws['!freeze'] = { xSplit: '0', ySplit: '1' };
  XLSX.utils.book_append_sheet(wb, ws, 'کاتالوگ');

  const guide: (string | null)[][] = [
    ['راهنمای قالب آپدیت کاتالوگ قطعات'],
    [''],
    ['ستون', 'الزامی', 'توضیح'],
    ['پارت‌نامبر', 'بله', 'کلید یکتای مرجع — حروف بزرگ/کوچک و فاصله‌ها نادیده گرفته می‌شود. مرجع جدید ساخته یا مرجع موجود به‌روز می‌شود.'],
    ['عنوان قطعه', 'پیشنهاد می‌شود', 'عنوان نمایشی مرجع. اگر مرجع موجود باشد و این ستون پر باشد، عنوان جایگزین می‌شود.'],
    ['مشخصات فنی', 'خیر', 'توضیحات/مدل. اگر مرجع موجود و فیلدش خالی باشد پر می‌شود؛ اگر مقدار جدید بدهد، جایگزین می‌شود.'],
    ['پارت‌نامبر ۲', 'خیر', 'پارت‌نامبر دوم/جایگزین (اختیاری).'],
    [''],
    ['قواعد آپدیت:'],
    ['۱)', '', 'ردیف با پارت‌نامبر تازه → مرجع جدید ساخته می‌شود.'],
    ['۲)', '', 'ردیف با پارت‌نامبر موجود → فقط فیلدهای «پرشده‌ی فایل» به‌روز می‌شوند؛ سلول خالی هیچ‌چیز را خراب نمی‌کند.'],
    ['۳)', '', 'هیچ رکوردی حذف نمی‌شود — اجرای دوباره‌ی همین فایل امن است (idempotent).'],
    ['۴)', '', 'پیش از ثبت، در دیالوگ «آپدیت از اکسل / Paste» دکمه‌ی «پیش‌نمایش» را بزنید.'],
    [''],
    ['نکته', '', 'ستون «ردیف» نگذارید — فقط همین چهار ستون به‌ترتیب. حداکثر حجم فایل ۱۰ مگابایت.'],
    [''],
    ['تاریخ تولید قالب', '', today],
    ['سامانه', '', 'Support Equipment Management — طراحی: میثم ایجادی / M.Ijadi@Hotmail.com'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'راهنما');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="part-catalog-template.xlsx"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

// ---------- GET /api/part-catalog/export — خروجی اکسل کاتالوگ فعلی (admin) ----------
// عمداً با همان ساختار template (شیت «کاتالوگ» + شیت «راهنما») تولید می‌شود تا
// فایل خروجی بدون دست‌کاری مستقیم به import-text/import بازبارگذاری شود — چرخه‌ی کامل دوطرفه.
router.get('/export', requireRole('admin'), (_req: Request, res: Response) => {
  const db = getDb();
  const j = jalaali.toJalaali(new Date());
  const today = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;

  const rows = db
    .prepare(
      `SELECT part_number_1, title, tech_specs, part_number_2
       FROM part_catalog
       ORDER BY part_number_1 COLLATE NOCASE`,
    )
    .all() as Array<{ part_number_1: string; title: string; tech_specs: string | null; part_number_2: string | null }>;

  const headers = ['پارت‌نامبر', 'عنوان قطعه', 'مشخصات فنی', 'پارت‌نامبر ۲'];
  const data = rows.map((r) => [r.part_number_1, r.title, r.tech_specs ?? '', r.part_number_2 ?? '']);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 30 }, { wch: 16 }];
  ws['!freeze'] = { xSplit: '0', ySplit: '1' };
  XLSX.utils.book_append_sheet(wb, ws, 'کاتالوگ');

  const guide: (string | null)[][] = [
    ['خروجی کاتالوگ قطعات — قابل بازبارگذاری در «آپدیت از اکسل / Paste»'],
    [''],
    ['ستون', 'الزامی', 'توضیح'],
    ['پارت‌نامبر', 'بله', 'کلید یکتای مرجع — حروف بزرگ/کوچک و فاصله‌ها نادیده گرفته می‌شود.'],
    ['عنوان قطعه', 'پیشنهاد می‌شود', 'عنوان نمایشی مرجع — ویرایشش پس از بازبارگذاری، عنوان همه‌ی قطعات وصل را هم‌راستا می‌کند.'],
    ['مشخصات فنی', 'خیر', 'توضیحات/مدل — خالی‌اش رها کنید تا تغییری نکند؛ مقدار جدید جایگزین می‌شود.'],
    ['پارت‌نامبر ۲', 'خیر', 'پارت‌نامبر دوم/جایگزین (اختیاری).'],
    [''],
    ['آمار این خروجی', '', `تعداد مراجع: ${rows.length}`],
    ['تاریخ خروجی', '', today],
    ['سامانه', '', 'Support Equipment Management — طراحی: میثم ایجادی / M.Ijadi@Hotmail.com'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'راهنما');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="part-catalog-export-${today.replace(/\//g, '-')}.xlsx"`); 
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
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
      if (dup) {
        // به‌جای خطای خشک، اطلاعات مرجع برخوردی برمی‌گردد تا UI «ادغام» را پیشنهاد دهد
        const conflict = db.prepare(`
          SELECT pc.id, pc.part_number_1, pc.title, pc.tech_specs,
                 (SELECT COUNT(*) FROM parts p WHERE p.catalog_id = pc.id) AS installed_count
          FROM part_catalog pc WHERE pc.part_number_1 = ? AND pc.id != ?
        `).get(newKey, id);
        return res.status(409).json({
          error: 'مرجع دیگری با این پارت‌نامبر موجود است — می‌توانید این مرجع را در آن ادغام کنید.',
          conflict,
        });
      }
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
  /** تعداد ردیف‌هایی که به‌جای مرجع جدید، در مرجع موجود ادغام شدند */
  mergedCount: number;
  /** ردیف‌های کامل برای ویرایش در UI (پیش‌نمایش) — حداکثر ۲۰۰ ردیف */
  items: CatalogImportItem[];
  itemsTotal: number;
  itemsTruncated: boolean;
}

/** یک ردیف پیش‌نمایش import — مقادیر «نهایی اعمال‌شونده» (بعد از overrides) */
interface CatalogImportItem {
  pn: string;
  title: string;
  specs: string;
  pn2: string;
  status: 'created' | 'updated' | 'skipped';
  filled?: string[];
  reason?: string;
  /** ردیف تکراری در همان فایل — قابل ویرایش نیست (ردیف اول اعمال می‌شود) */
  duplicate?: boolean;
  /** مرجع از قبل موجود بوده؟ */
  existing: boolean;
  /** PN مشابه یک مرجع موجود است (احتمال غلط تایپی) — پیشنهاد ادغام */
  similarTo?: { id: number; part_number_1: string; title: string };
}

/** ویرایش‌های کاربر روی پیش‌نمایش — کلید = PN نرمال‌شده؛ فیلد حاضر ولی خالی = «این مقدار اعمال نشود» */
export type CatalogOverrides = Record<string, { title?: string; specs?: string; pn2?: string }>;

/** تصمیم کاربر برای PN برخوردی مشابه — کلید = PN نرمال‌شده‌ی فایل */
export type CatalogResolutions = Record<string, 'new' | { mergeInto: number }>;

/** پاک‌سازی overrides ورودی — کلیدها نرمال، مقادیر بریده به سقف فیلدها */
function sanitizeOverrides(raw: unknown): CatalogOverrides {
  const out: CatalogOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const entry: { title?: string; specs?: string; pn2?: string } = {};
    if (typeof o.title === 'string') entry.title = o.title.slice(0, 200);
    if (typeof o.specs === 'string') entry.specs = o.specs.slice(0, 2000);
    if (typeof o.pn2 === 'string') entry.pn2 = o.pn2.slice(0, 120);
    const key = normalizePn(k);
    if (key && Object.keys(entry).length > 0) out[key] = entry;
  }
  return out;
}

/** پاک‌سازی resolutions ورودی — کلیدها نرمال، merge_id عددی مثبت */
function sanitizeResolutions(raw: unknown): CatalogResolutions {
  const out: CatalogResolutions = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizePn(k);
    if (!key) continue;
    if (v === 'new') { out[key] = 'new'; continue; }
    if (v && typeof v === 'object' && Number.isInteger((v as { mergeInto?: unknown }).mergeInto) && (v as { mergeInto: number }).mergeInto > 0) {
      out[key] = { mergeInto: (v as { mergeInto: number }).mergeInto };
    }
  }
  return out;
}

/** فاصله‌ی لِوِنشتاین — سقف ۴۹۹ برای جلوگیری از O(n²) سنگین روی رشته‌های عجیب */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/** آستانه‌ی «احتمال غلط تایپی»: حداکثر ۲ ویرایش یا ≤ ۲۰٪ طول (هر کدام بیشتر است) */
function pnSimilarityThreshold(len: number): number {
  return Math.min(3, Math.max(2, Math.ceil(len * 0.2)));
}

/** نزدیک‌ترین مرجع موجود به یک PN — فقط PNهایی که طولشان ±۳ است (شاخص گذر سریع) */
function findSimilarCatalogEntry(db: ReturnType<typeof getDb>, key: string): { id: number; part_number_1: string; title: string; dist: number } | null {
  const all = db.prepare(`SELECT id, part_number_1, title FROM part_catalog`).all() as
    Array<{ id: number; part_number_1: string; title: string }>;
  let best: { id: number; part_number_1: string; title: string; dist: number } | null = null;
  for (const r of all) {
    if (Math.abs(r.part_number_1.length - key.length) > 3) continue;
    const d = levenshtein(key, r.part_number_1);
    if (d === 0) continue;
    const max = Math.min(pnSimilarityThreshold(key.length), pnSimilarityThreshold(r.part_number_1.length));
    if (d <= max && (!best || d < best.dist)) best = { ...r, dist: d }; 
  }
  return best;
}

/** اجرای upsert آیتم‌های کاتالوگ — در تراکنش؛ dry_run فقط شبیه‌سازی می‌کند */
function applyCatalogUpserts(items: CatalogImportRow[], dryRun: boolean, overrides: CatalogOverrides = {}, resolutions: CatalogResolutions = {}): CatalogImportResult {
  const db = getDb();
  const result: CatalogImportResult = {
    dryRun, createdCount: 0, updatedCount: 0, skippedCount: 0, created: [], updated: [], skipped: [],
    items: [], itemsTotal: 0, itemsTruncated: false, mergedCount: 0,
  };
  const seen = new Set<string>();

  const step = () => {
    for (const it of items) {
      const key = normalizePn(it.pn);
      const rec = (r: CatalogImportItem) => {
        result.itemsTotal++;
        if (result.items.length < 200) result.items.push(r);
        else result.itemsTruncated = true;
      };
      if (!key) { result.skipped.push({ pn: it.pn, reason: 'پارت‌نامبر نامعتبر/خالی است.' }); rec({ pn: it.pn, title: it.title, specs: it.specs, pn2: it.pn2, status: 'skipped', reason: 'پارت‌نامبر نامعتبر/خالی است.', existing: false }); continue; }
      if (seen.has(key)) { result.skipped.push({ pn: key, reason: 'در همین فایل تکرار شده — فقط اولین ردیف اعمال شد.' }); rec({ pn: key, title: it.title, specs: it.specs, pn2: it.pn2, status: 'skipped', reason: 'در همین فایل تکرار شده — فقط اولین ردیف اعمال شد.', duplicate: true, existing: false }); continue; }
      seen.add(key);

      // ویرایش‌های کاربر روی پیش‌نمایش — فیلد حاضر ولی خالی = «این مقدار اعمال نشود»
      const ov = overrides[key];
      const title = ov && typeof ov.title === 'string' ? ov.title.trim() : (it.title?.trim() || '');
      const specs = ov && typeof ov.specs === 'string' ? ov.specs.trim() : (it.specs?.trim() || '');
      const pn2 = ov && typeof ov.pn2 === 'string' ? ov.pn2.trim() : (it.pn2?.trim() || '');

      const existing = db.prepare(`SELECT id, title, tech_specs, part_number_2 FROM part_catalog WHERE part_number_1 = ?`).get(key) as
        | { id: number; part_number_1: string; title: string; tech_specs: string | null; part_number_2: string | null }
        | undefined;

      // ⚠ PN مشابه یک مرجع دیگر = احتمال غلط تایپی — مگر آن‌که کاربر تصمیم گرفته باشد
      const reso = resolutions[key];
      const decidedNew = reso === 'new';
      const targetId = reso && typeof reso === 'object' ? reso.mergeInto : null;
      if (!existing && !decidedNew) {
        const sim = findSimilarCatalogEntry(db, key);
        const target = targetId
          ? (db.prepare(`SELECT id, part_number_1, title, tech_specs, part_number_2 FROM part_catalog WHERE id = ?`).get(targetId) as
              | { id: number; part_number_1: string; title: string; tech_specs: string | null; part_number_2: string | null }
              | undefined)
          : sim
            ? (db.prepare(`SELECT id, part_number_1, title, tech_specs, part_number_2 FROM part_catalog WHERE id = ?`).get(sim.id) as
                | { id: number; part_number_1: string; title: string; tech_specs: string | null; part_number_2: string | null }
                | undefined)
            : undefined;
        if (target) {
          if (!targetId) {
            // بدون تصمیم کاربر → فقط هشدار و پیشنهاد (هیچ تغییری نوشته نمی‌شود)
            rec({ pn: key, title: title || key, specs, pn2, status: 'skipped', reason: `PN مشابه مرجع موجود «${target.part_number_1}» است — احتمال غلط تایپی؛ تصمیم بگیرید: ادغام یا ثبت جدید.`, existing: false, similarTo: { id: target.id, part_number_1: target.part_number_1, title: target.title } });
            result.skipped.push({ pn: key, reason: `مشابه «${target.part_number_1}» — ادغام یا ثبت جدید؟` });
            continue;
          }
          // کاربر ادغام در target را انتخاب کرده: مقادیر فایل را در مرجع موجود می‌ریزیم (فقط فیلدهای پرشده)
          const filledM: string[] = [];
          const mTitle = title && title !== target.title ? title : null;
          const mSpecs = specs && specs !== (target.tech_specs ?? '') ? specs : null;
          const mPn2 = pn2 && pn2 !== (target.part_number_2 ?? '') ? pn2 : null;
          if (mTitle) filledM.push('عنوان');
          if (mSpecs) filledM.push('مشخصات');
          if (mPn2) filledM.push('پارت‌نامبر ۲');
          if (filledM.length > 0) {
            if (!dryRun) {
              db.prepare(`UPDATE part_catalog SET title = COALESCE(?, title), tech_specs = COALESCE(?, tech_specs), part_number_2 = COALESCE(?, part_number_2), updated_at = datetime('now') WHERE id = ?`)
                .run(mTitle, mSpecs, mPn2, target.id);
            }
            result.updated.push({ part_number_1: target.part_number_1, title: mTitle || target.title, filled: filledM });
            rec({ pn: key, title: title || key, specs, pn2, status: 'updated', filled: filledM, existing: true, similarTo: { id: target.id, part_number_1: target.part_number_1, title: target.title } });
          } else {
            result.skipped.push({ pn: key, reason: `در مرجع «${target.part_number_1}» ادغام شد ولی فایل مقدار جدیدی نداشت.` });
            rec({ pn: key, title: title || key, specs, pn2, status: 'skipped', reason: `در مرجع «${target.part_number_1}» ادغام شد ولی فایل مقدار جدیدی نداشت.`, existing: true, similarTo: { id: target.id, part_number_1: target.part_number_1, title: target.title } });
          }
          result.mergedCount++;
          continue;
        }
      }

      if (!existing) {
        // مرجع جدید — عنوان اجباری نیست؛ خالی باشد پارت‌نامبر می‌نشیند (قابل ویرایش بعدی)
        if (!dryRun) {
          db.prepare(`INSERT INTO part_catalog (part_number_1, part_number_2, title, tech_specs) VALUES (?, ?, ?, ?)`)
            .run(key, pn2 || null, title || key, specs || null);
        }
        result.created.push({ part_number_1: key, title: title || key });
        rec({ pn: key, title: title || key, specs, pn2, status: 'created', existing: false });
        continue;
      }

      // مرجع موجود — فقط فیلدهای «پرشده‌ی فایل/ویرایش‌شده» به‌روز می‌شوند
      const filled: string[] = [];
      const newTitle = title && title !== existing.title ? title : null;
      const newSpecs = specs && specs !== (existing.tech_specs ?? '') ? specs : null;
      const newPn2 = pn2 && pn2 !== (existing.part_number_2 ?? '') ? pn2 : null;
      if (newTitle) filled.push('عنوان');
      if (newSpecs) filled.push('مشخصات');
      if (newPn2) filled.push('پارت‌نامبر ۲');
      if (filled.length === 0) {
        result.skipped.push({ pn: key, reason: 'موجود است و فایل مقدار جدیدی برای آن نداشت.' });
        rec({ pn: key, title, specs, pn2, status: 'skipped', reason: 'موجود است و فایل مقدار جدیدی برای آن نداشت.', existing: true });
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
      rec({ pn: key, title, specs, pn2, status: 'updated', filled, existing: true });
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
      overrides: z.unknown().optional(),
      resolutions: z.unknown().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'متن الزامی است.', detail: parsed.error.flatten() });
    const { text, dry_run } = parsed.data;
    const overrides = sanitizeOverrides(parsed.data.overrides);
    const resolutions = sanitizeResolutions(parsed.data.resolutions);

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
    return res.json({ ok: true, result: applyCatalogUpserts(items, dry_run, overrides, resolutions) });
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
      // ویرایش/تصمیم‌های پیش‌نمایش در هدرهای JSON-encoded می‌آیند (چون بدنه multipart است)
      let overrides: CatalogOverrides = {};
      const ovHeader = req.headers['x-overrides'];
      if (typeof ovHeader === 'string') {
        try { overrides = sanitizeOverrides(JSON.parse(ovHeader)); } catch { /* هدر نامعتبر → بدون overrides */ }
      }
      let resolutions: CatalogResolutions = {};
      const resHeader = req.headers['x-resolutions'];
      if (typeof resHeader === 'string') {
        try { resolutions = sanitizeResolutions(JSON.parse(resHeader)); } catch { /* هدر نامعتبر → بدون resolutions */ }
      }
      return void res.json({ ok: true, file: file.filename, result: applyCatalogUpserts(items, dryRun, overrides, resolutions) });
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: 'خطا در پردازش فایل.', detail: (err as Error).message });
    }
  });
});

export default router;
