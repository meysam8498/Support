// ============================================================
// جست‌وجوی سراسری — یک باکس، همه‌چیز
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// GET /api/search?q=<متن>
//   • جست‌وجوی زیررشته‌ای (LIKE %q%) روی پروژه‌ها، تجهیزات (سریال/پارت‌نامبر/
//     توضیحات/قرارداد/تاریخ‌ها)، قطعات، کارشناسان و تعویض‌های گارانتی.
//   • نتیجه گروه‌بندی بر اساس نوع، با مسیر UI برای ناوبری مستقیم.
//   • هر hit شامل meta (شماره قرارداد، تاریخ‌های شمسی، وضعیت، مدت گارانتی)
//     و matched (فیلد و مقداری که واقعاً با عبارت تطبیق کرده) است تا کلاینت
//     بتواند متادیتا را نشان و عبارت را هایلایت کند.
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

/** وضعیت تجهیز/قطعه به فارسی */
function faStatus(s: string): string {
  switch (s) {
    case 'active': return 'فعال';
    case 'defective': return 'معیوب';
    case 'replacing': return 'در حال تعویض';
    case 'replaced': return 'تعویض‌شده';
    default: return s;
  }
}

/** بریدن مقدارهای بلند برای خط matched */
function trunc(v: string, max = 70): string {
  return v.length > max ? v.slice(0, max) + '…' : v;
}

/** ساخت رشته‌ی متا از بخش‌های غیرتکراری */
function metaOf(...parts: (string | null | undefined)[]): string {
  return [...new Set(parts.map((p) => (p ?? '').trim()).filter(Boolean))].join(' · ');
}

// ---------- شکل داده‌ی پاسخ ----------
interface Matched {
  field: string;        // نام فارسی فیلد تطبیق‌یافته
  value: string;        // مقدار کامل فیلد (برای هایلایت)
}

interface Hit {
  type: 'project' | 'device' | 'part' | 'expert' | 'replacement';
  id: number;
  label: string;      // برچسب اصلی
  sub: string;        // خط دوم (سریال/پروژه/تاریخ)
  meta: string;       // خط متا: قرارداد، تاریخ‌ها، وضعیت
  matched: Matched;   // فیلد/مقدار واقعی تطبیق‌یافته (برای هایلایت)
  link: string;       // مسیر UI
  badge: string;      // برچسب کوتاه نوع
}

const GROUP_LIMIT = 10;

// ---------- GET /api/search?q=&types=&page=&per_page= ----------
//   • types: فیلتر نوع با کاما — مثلاً types=part,device (خالی = همه)
//   • page/per_page: صفحه‌بندی کلی روی hits پس از گروه‌بندی (per_page=0 = همه)
router.get('/', (req: Request, res: Response) => {
  let raw = String(req.query.q ?? '').trim();
  if (raw.length < 2) return res.json({ q: raw, hits: [], groups: [], empty: true, total: 0, page: 1, per_page: 0, has_more: false });
  if (raw.length > 100) raw = raw.slice(0, 100);

  const userId = (req as unknown as { user?: { sub?: number } }).user?.sub ?? 0;
  if (rateLimited(userId)) {
    return res.status(429).json({ error: 'تعداد جست‌وجوها زیاد است؛ چند لحظه بعد تلاش کنید.' });
  }

  // فیلتر نوع — فقط انواع معتبر
  const ALL_TYPES = ['project', 'device', 'part', 'expert', 'replacement'] as const;
  const typesParam = String(req.query.types ?? '').trim();
  const wanted = typesParam
    ? typesParam.split(',').map((s) => s.trim()).filter((s): s is typeof ALL_TYPES[number] => (ALL_TYPES as readonly string[]).includes(s))
    : [...ALL_TYPES];
  const typeOn = (t: typeof ALL_TYPES[number]) => wanted.includes(t);

  // صفحه‌بندی: صفحه‌ی درخواستی و اندازه‌ی صفحه (0 = بدون صفحه‌بندی)
  const perPage = Math.max(0, Math.min(100, Number(req.query.per_page) || 0));
  const page = Math.max(1, Number(req.query.page) || 1);

  const db = getDb();
  const esc = likeEscape(raw);
  const like = `%${esc}%`;

  const hits: Hit[] = [];

  // --- پروژه‌ها (نام + شماره قرارداد) ---
  const projects = typeOn('project') ? db.prepare(`
    SELECT p.id, p.name, p.contract_number, se.name AS sales_expert_name,
           (SELECT COUNT(*) FROM devices WHERE project_id = p.id) AS devices_count
    FROM projects p LEFT JOIN sales_experts se ON se.id = p.sales_expert_id
    WHERE p.name LIKE ? ESCAPE '\\' OR p.contract_number LIKE ? ESCAPE '\\'
    ORDER BY p.id DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like) as { id: number; name: string; contract_number: string | null; sales_expert_name: string | null; devices_count: number }[] : [];

  for (const p of projects) {
    const contractMatched = p.contract_number && p.contract_number.includes(raw);
    hits.push({
      type: 'project', id: p.id, label: p.name,
      sub: [p.sales_expert_name, `${p.devices_count} تجهیز`].filter(Boolean).join(' · '),
      meta: metaOf(p.contract_number && `قرارداد ${p.contract_number}`),
      matched: contractMatched
        ? { field: 'شماره قرارداد', value: p.contract_number! }
        : { field: 'نام پروژه', value: p.name },
      link: `/dashboard/customer/${p.id}`, badge: 'پروژه',
    });
  }

  // --- تجهیزات (سریال، پارت‌نامبرها، توضیحات، قرارداد، تاریخ‌ها) + پروژه و نوع ---
  const devices = typeOn('device') ? db.prepare(`
    SELECT d.id, d.main_serial, d.description, d.part_number_1, d.part_number_2, d.status,
           d.contract_number, d.warehouse_exit_jalali, d.customer_delivery_jalali,
           d.warranty_duration_months, d.warranty_end_jalali,
           dt.name AS type_name, b.name AS brand_name, p.name AS project_name
    FROM devices d
    LEFT JOIN device_types dt ON dt.id = d.device_type_id
    LEFT JOIN brands b ON b.id = d.brand_id
    JOIN projects p ON p.id = d.project_id
    WHERE d.main_serial LIKE ? ESCAPE '\\'
       OR d.part_number_1 LIKE ? ESCAPE '\\'
       OR d.part_number_2 LIKE ? ESCAPE '\\'
       OR d.description LIKE ? ESCAPE '\\'
       OR d.contract_number LIKE ? ESCAPE '\\'
       OR d.warehouse_exit_jalali LIKE ? ESCAPE '\\'
       OR d.customer_delivery_jalali LIKE ? ESCAPE '\\'
       OR d.warranty_end_jalali LIKE ? ESCAPE '\\'
    ORDER BY d.id DESC LIMIT ${GROUP_LIMIT}
  `).all(like, like, like, like, like, like, like, like) as {
    id: number; main_serial: string | null; description: string | null;
    part_number_1: string | null; part_number_2: string | null; status: string;
    contract_number: string | null; warehouse_exit_jalali: string | null;
    customer_delivery_jalali: string | null; warranty_duration_months: number | null;
    warranty_end_jalali: string | null;
    type_name: string | null; brand_name: string | null; project_name: string;
  }[] : [];

  for (const d of devices) {
    // فیلد واقعی تطبیق‌یافته را مشخص کن (اولویت با فیلدهای ساخت‌یافته)
    let matched: Matched;
    if (d.contract_number?.includes(raw)) matched = { field: 'شماره قرارداد', value: d.contract_number };
    else if (d.warehouse_exit_jalali?.includes(raw)) matched = { field: 'تاریخ خروج از انبار', value: d.warehouse_exit_jalali };
    else if (d.customer_delivery_jalali?.includes(raw)) matched = { field: 'تاریخ تحویل به مشتری', value: d.customer_delivery_jalali };
    else if (d.warranty_end_jalali?.includes(raw)) matched = { field: 'پایان گارانتی', value: d.warranty_end_jalali };
    else if (d.main_serial?.includes(raw)) matched = { field: 'سریال تجهیز', value: d.main_serial };
    else if (d.part_number_1?.includes(raw)) matched = { field: 'پارت‌نامبر', value: d.part_number_1 };
    else if (d.part_number_2?.includes(raw)) matched = { field: 'پارت‌نامبر ۲', value: d.part_number_2 };
    else if (d.description?.includes(raw)) matched = { field: 'توضیحات', value: trunc(d.description) };
    else matched = { field: 'تجهیز', value: d.main_serial || d.type_name || '' };

    hits.push({
      type: 'device', id: d.id,
      label: [d.type_name, d.brand_name].filter(Boolean).join(' ') || 'تجهیز',
      sub: [d.project_name, d.main_serial, d.description ? trunc(d.description, 50) : null].filter(Boolean).join(' · '),
      meta: metaOf(
        d.contract_number && `قرارداد ${d.contract_number}`,
        d.warehouse_exit_jalali && `خروج از انبار ${d.warehouse_exit_jalali}`,
        d.customer_delivery_jalali && `تحویل ${d.customer_delivery_jalali}`,
        d.warranty_duration_months != null ? `گارانتی ${d.warranty_duration_months} ماهه` : null,
        d.warranty_end_jalali && `پایان گارانتی ${d.warranty_end_jalali}`,
        `وضعیت: ${faStatus(d.status)}`,
      ),
      matched, link: `/devices/${d.id}`, badge: 'تجهیز',
    });
  }

  // --- قطعات (عنوان، مشخصات، پارت‌نامبرها، سریال) + دستگاه و پروژه ---
  const parts = typeOn('part') ? db.prepare(`
    SELECT pt.id, pt.title, pt.tech_specs, pt.part_number_1, pt.part_number_2,
           pt.part_serial_number, pt.status,
           d.main_serial AS device_serial, d.id AS device_id,
           d.contract_number AS device_contract,
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
  `).all(like, like, like, like, like) as {
    id: number; title: string; tech_specs: string | null; part_serial_number: string | null;
    part_number_1: string | null; part_number_2: string | null; status: string;
    device_serial: string | null; device_id: number; device_contract: string | null; project_name: string;
  }[] : [];

  for (const pt of parts) {
    let matched: Matched;
    if (pt.part_serial_number?.includes(raw)) matched = { field: 'سریال قطعه', value: pt.part_serial_number };
    else if (pt.part_number_1?.includes(raw)) matched = { field: 'پارت‌نامبر', value: pt.part_number_1 };
    else if (pt.part_number_2?.includes(raw)) matched = { field: 'پارت‌نامبر ۲', value: pt.part_number_2 };
    else if (pt.tech_specs?.includes(raw)) matched = { field: 'مشخصات فنی', value: trunc(pt.tech_specs) };
    else if (pt.title?.includes(raw)) matched = { field: 'عنوان قطعه', value: pt.title };
    else matched = { field: 'قطعه', value: pt.title };

    hits.push({
      type: 'part', id: pt.id, label: pt.title,
      sub: [pt.project_name, pt.device_serial, pt.part_serial_number].filter(Boolean).join(' · '),
      meta: metaOf(
        pt.device_contract && `قرارداد ${pt.device_contract}`,
        `وضعیت: ${faStatus(pt.status)}`,
      ),
      matched, link: `/parts/${pt.id}`, badge: 'قطعه',
    });
  }

  // --- کارشناسان (فروش + فنی) — با شمارش تجهیزات مرتبط ---
  const experts = typeOn('expert') ? db.prepare(`
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
  `).all(like, like, like, like) as { id: number; name: string; phone: string | null; devices_count: number; kind: string }[] : [];

  for (const e of experts) {
    hits.push({
      type: 'expert', id: e.id, label: e.name,
      sub: [e.kind === 'sales' ? 'کارشناس فروش' : 'کارشناس فنی', e.phone, `${e.devices_count} تجهیز`].filter(Boolean).join(' · '),
      meta: '',
      matched: e.name.includes(raw)
        ? { field: 'نام', value: e.name }
        : { field: 'تلفن', value: e.phone || e.name },
      link: e.kind === 'sales' ? `/lists?tab=experts` : `/lists?tab=experts`,
      badge: 'کارشناس',
    });
  }

  // --- تعویض‌های گارانتی (سریال قطعه قدیم/جدید، توضیحات) ---
  const replacements = typeOn('replacement') ? db.prepare(`
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
  `).all(like, like, like, like, like) as { id: number; device_id: number; description: string | null; replaced_at_jalali: string; old_title: string | null; old_serial: string | null; new_title: string | null; new_serial: string | null; failure_reason: string | null; device_serial: string | null; project_name: string }[] : [];

  for (const r of replacements) {
    let matched: Matched;
    if (r.old_serial?.includes(raw)) matched = { field: 'سریال قطعه‌ی قدیم', value: r.old_serial };
    else if (r.new_serial?.includes(raw)) matched = { field: 'سریال قطعه‌ی جدید', value: r.new_serial };
    else if (r.description?.includes(raw)) matched = { field: 'توضیحات تعویض', value: trunc(r.description) };
    else if (r.old_title?.includes(raw)) matched = { field: 'قطعه‌ی قدیم', value: r.old_title };
    else matched = { field: 'قطعه‌ی جدید', value: r.new_title || '' };

    hits.push({
      type: 'replacement', id: r.id,
      label: `${r.old_title || '؟'} ← ${r.new_title || '؟'}`,
      sub: [r.project_name, r.device_serial, r.failure_reason].filter(Boolean).join(' · '),
      meta: metaOf(r.replaced_at_jalali && `تاریخ تعویض ${r.replaced_at_jalali}`),
      matched, link: `/devices/${r.device_id}`, badge: 'تعویض',
    });
  }

  // --- گروه‌بندی برای نمایش (فقط انواع فعال + شمارش کل بدون صفحه‌بندی) ---
  const groupMeta = [
    { type: 'project' as const, title: 'پروژه‌ها', count: projects.length },
    { type: 'device' as const, title: 'تجهیزات', count: devices.length },
    { type: 'part' as const, title: 'قطعات', count: parts.length },
    { type: 'expert' as const, title: 'کارشناسان', count: experts.length },
    { type: 'replacement' as const, title: 'تعویض‌های گارانتی', count: replacements.length },
  ];
  const groups = groupMeta.filter((g) => g.count > 0);

  // --- صفحه‌بندی کلی (روی ترتیب فعلی hits) وقتی per_page > 0 ---
  const total = hits.length;
  let outHits = hits;
  let outGroups = groups;
  if (perPage > 0) {
    const start = (page - 1) * perPage;
    outHits = hits.slice(start, start + perPage);
    const shownTypes = new Set(outHits.map((h) => h.type));
    outGroups = groupMeta
      .filter((g) => shownTypes.has(g.type))
      .map((g) => ({ ...g, count: outHits.filter((h) => h.type === g.type).length }));
  }

  return res.json({
    q: raw,
    hits: outHits,
    groups: outGroups,
    empty: total === 0,
    total,
    page: perPage > 0 ? page : 1,
    per_page: perPage,
    has_more: perPage > 0 ? page * perPage < total : false,
    type_counts: Object.fromEntries(groupMeta.map((g) => [g.type, g.count])),
  });
});

export default router;
