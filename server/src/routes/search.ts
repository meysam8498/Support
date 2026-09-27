// ============================================================
// جست‌وجوی سراسری — یک باکس، همه‌چیز
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// GET /api/search?q=<متن>
//   • جست‌وجوی زیررشته‌ای (LIKE %q%) روی پروژه‌ها، تجهیزات (سریال/پارت‌نامبر/
//     توضیحات)، قطعات (عنوان/مشخصات/پارت‌نامبر/سریال)، کارشناسان فروش/فنی،
//     برندها و تعویض‌های گارانتی.
//   • نتیجه گروه‌بندی بر اساس نوع، با مسیر UI برای ناوبری مستقیم.
//   • محدودیت نرخ درون‌حافظه‌ای (۶۰ درخواست/دقیقه/کاربر) تا جست‌وجوی
//     پشت‌سرهم چند کاربر همزمان، SQLite را تحت فشار نگذارد.
// ============================================================
import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/db.js';

const router = Router();

// ---------- محدودیت نرخ درون‌حافظه‌ای (۶۰ درخواست/دقیقه/کاربر) ----------
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const buckets = new Map<number, { count: number; resetAt: number }>();

function rateLimited(userId: number): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now >= b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  b.count++;
  return b.count > RATE_LIMIT;
}

// پاک‌سازی دوره‌ای bucket های منقضی — جلوی رشد بی‌حد حافظه
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
}, 5 * 60_000).unref();

/** LIKE-safe کردن ورودی جست‌وجو (٪ و _ و \ escape می‌شوند) */
function likeEscape(q: string): string {
  return q.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

// ---------- شکل داده‌ی پاسخ ----------
interface Hit {
  type: 'project' | 'device' | 'part' | 'expert' | 'replacement';
  id: number;
  label: string;      // برچسب اصلی
  sub: string;        // خط دوم (سریال/پروژه/تاریخ)
  link: string;       // مسیر UI
  badge: string;      // برچسب کوتاه نوع
}

const GROUP_LIMIT = 10;

// ---------- GET /api/search?q= ----------
router.get('/', (req: Request, res: Response) => {
  let raw = String(req.query.q ?? '').trim();
  if (raw.length < 2) return res.json({ q: raw, hits: [], groups: [], empty: true });
  if (raw.length > 100) raw = raw.slice(0, 100);

  const userId = (req as unknown as { user?: { sub?: number } }).user?.sub ?? 0;
  if (rateLimited(userId)) {
    return res.status(429).json({ error: 'تعداد جست‌وجوها زیاد است؛ چند لحظه بعد تلاش کنید.' });
  }

  const db = getDb();
  const esc = likeEscape(raw);
  const like = `%${esc}%`;

  const hits: Hit[] = [];

  // --- پروژه‌ها (نام + شماره قرارداد) ---
  const projects = db.prepare(`
    SELECT p.id, p.name, p.contract_number, se.name AS sales_expert_name,
           (SELECT COUNT(*) FROM devices WHERE project_id = p.id) AS devices_count
    FROM projects p LEFT JOIN sales_experts se ON se.id = p.sales_expert_id
    WHERE p.name LIKE ? ESCAPE '\\' OR p.contract_number LIKE ? ESCAPE '\\'
    ORDER BY p.id DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like) as { id: number; name: string; contract_number: string | null; sales_expert_name: string | null; devices_count: number }[];

  for (const p of projects) {
    hits.push({
      type: 'project', id: p.id, label: p.name,
      sub: [p.contract_number, p.sales_expert_name, `${p.devices_count} تجهیز`].filter(Boolean).join(' · '),
      link: `/dashboard/customer/${p.id}`, badge: 'پروژه',
    });
  }

  // --- تجهیزات (سریال، پارت‌نامبرها، توضیحات) + پروژه و نوع ---
  const devices = db.prepare(`
    SELECT d.id, d.main_serial, d.description, d.part_number_1, d.part_number_2, d.status,
           dt.name AS type_name, b.name AS brand_name, p.name AS project_name
    FROM devices d
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN brands b ON b.id = d.brand_id
    JOIN projects p ON p.id = d.project_id
    WHERE d.main_serial LIKE ? ESCAPE '\\'
       OR d.part_number_1 LIKE ? ESCAPE '\\'
       OR d.part_number_2 LIKE ? ESCAPE '\\'
       OR d.description LIKE ? ESCAPE '\\'
    ORDER BY d.id DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like, like, like) as { id: number; main_serial: string | null; description: string | null; status: string; type_name: string | null; brand_name: string | null; project_name: string }[];

  for (const d of devices) {
    hits.push({
      type: 'device', id: d.id,
      label: [d.type_name, d.brand_name].filter(Boolean).join(' ') || 'تجهیز',
      sub: [d.project_name, d.main_serial, d.description].filter(Boolean).join(' · '),
      link: `/devices/${d.id}`, badge: 'تجهیز',
    });
  }

  // --- قطعات (عنوان، مشخصات، پارت‌نامبرها، سریال) + دستگاه و پروژه ---
  const parts = db.prepare(`
    SELECT pt.id, pt.title, pt.tech_specs, pt.part_number_1, pt.part_number_2,
           pt.part_serial_number, pt.status,
           d.main_serial AS device_serial, d.id AS device_id,
           pr.name AS project_name
    FROM parts pt
    JOIN devices d ON d.id = pt.device_id
    JOIN projects pr ON pr.id = d.project_id
    WHERE pt.title LIKE ? ESCAPE '\\'
       OR pt.tech_specs LIKE ? ESCAPE '\\'
       OR pt.part_number_1 LIKE ? ESCAPE '\\'
       OR pt.part_number_2 LIKE ? ESCAPE '\\'
       OR pt.part_serial_number LIKE ? ESCAPE '\\'
    ORDER BY pt.id DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like, like, like, like) as { id: number; title: string; tech_specs: string | null; part_serial_number: string | null; status: string; device_serial: string | null; device_id: number; project_name: string }[];

  for (const pt of parts) {
    hits.push({
      type: 'part', id: pt.id, label: pt.title,
      sub: [pt.project_name, pt.device_serial, pt.part_serial_number].filter(Boolean).join(' · '),
      link: `/parts/${pt.id}`, badge: 'قطعه',
    });
  }

  // --- کارشناسان (فروش + فنی) — با شمارش تجهیزات مرتبط ---
  const experts = db.prepare(`
    SELECT se.id, se.name, se.phone,
           (SELECT COUNT(*) FROM devices WHERE sales_expert_id = se.id) AS devices_count,
           'sales' AS kind
    FROM sales_experts se WHERE se.name LIKE ? ESCAPE '\\' OR se.phone LIKE ? ESCAPE '\\'
    UNION ALL
    SELECT te.id, te.name, te.phone,
           (SELECT COUNT(*) FROM devices WHERE technical_expert_id = te.id) AS devices_count,
           'technical' AS kind
    FROM technical_experts te WHERE te.name LIKE ? ESCAPE '\\' OR te.phone LIKE ? ESCAPE '\\'
    ORDER BY devices_count DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like, like, like) as { id: number; name: string; phone: string | null; devices_count: number; kind: string }[];

  for (const e of experts) {
    hits.push({
      type: 'expert', id: e.id, label: e.name,
      sub: [e.kind === 'sales' ? 'کارشناس فروش' : 'کارشناس فنی', e.phone, `${e.devices_count} تجهیز`].filter(Boolean).join(' · '),
      link: e.kind === 'sales' ? `/lists?tab=experts` : `/lists?tab=experts`,
      badge: 'کارشناس',
    });
  }

  // --- تعویض‌های گارانتی (سریال قطعه قدیم/جدید، توضیحات) ---
  const replacements = db.prepare(`
    SELECT wr.id, wr.old_part_id, wr.new_part_id, wr.description,
           wr.replaced_at_jalali, wr.device_id,
           op.title AS old_title, op.part_serial_number AS old_serial,
           np.title AS new_title, np.part_serial_number AS new_serial,
           fr.name AS failure_reason, d.main_serial AS device_serial, pr.name AS project_name
    FROM warranty_replacements wr
    JOIN devices d ON d.id = wr.device_id
    JOIN projects pr ON pr.id = d.project_id
    LEFT JOIN parts op ON op.id = wr.old_part_id
    LEFT JOIN parts np ON np.id = wr.new_part_id
    LEFT JOIN failure_reasons fr ON fr.id = wr.failure_reason_id
    WHERE op.title LIKE ? ESCAPE '\\'
       OR op.part_serial_number LIKE ? ESCAPE '\\'
       OR np.title LIKE ? ESCAPE '\\'
       OR np.part_serial_number LIKE ? ESCAPE '\\'
       OR wr.description LIKE ? ESCAPE '\\'
    ORDER BY wr.replaced_at_gregorian DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like, like, like, like) as { id: number; device_id: number; description: string | null; replaced_at_jalali: string; old_title: string | null; old_serial: string | null; new_title: string | null; new_serial: string | null; failure_reason: string | null; device_serial: string | null; project_name: string }[];

  for (const r of replacements) {
    hits.push({
      type: 'replacement', id: r.id,
      label: `${r.old_title || '؟'} ← ${r.new_title || '؟'}`,
      sub: [r.project_name, r.device_serial, r.replaced_at_jalali, r.failure_reason].filter(Boolean).join(' · '),
      link: `/devices/${r.device_id}`, badge: 'تعویض',
    });
  }

  // --- گروه‌بندی برای نمایش ---
  const groups = [
    { type: 'project' as const, title: 'پروژه‌ها', count: projects.length },
    { type: 'device' as const, title: 'تجهیزات', count: devices.length },
    { type: 'part' as const, title: 'قطعات', count: parts.length },
    { type: 'expert' as const, title: 'کارشناسان', count: experts.length },
    { type: 'replacement' as const, title: 'تعویض‌های گارانتی', count: replacements.length },
  ].filter((g) => g.count > 0);

  return res.json({ q: raw, hits, groups, empty: hits.length === 0 });
});

export default router;
