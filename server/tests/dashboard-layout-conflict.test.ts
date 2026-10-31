// ============================================================
// تست سرورِ قاعده‌ی تداخل ۴۰۹ در PUT /api/dashboard/layout (۱.۳۲)
// ------------------------------------------------------------
// قاعده (dashboard.ts): اگر کلاینت base_updated_at بفرستد و ردیف از آن
// زمان جلوتر رفته باشد (نشست دیگری وسطِ کار نوشته) → ۴۰۹ با نسخه‌ی
// تازه‌ی سرور (`current`) تا کلاینت بتواند تصمیم بگیرد. حالت‌ها:
//   • نوشتن نخستین (بدون ردیف / بدون base) → ۲۰۰ — قاعده فقط برای base فعال است
//   • base برابر با وضعیت فعلی ردیف → ۲۰۰ (تداخلی در کار نیست)
//   • base قدیمی (نشست دیگر زودتر نوشته) → ۴۰۹ با conflict=true و current
//     + ردیف بازنویسی نمی‌شود (GET همان نسخه‌ی نشست برنده را می‌دهد)
// نکته‌ی زمانی: سرور updated_at را با datetime('now') می‌نویسد (دقت ثانیه)،
// پس بین نوشتن دو نشست >۱ ثانیه صبر می‌شود تا ردیف واقعاً «جلوتر» باشد —
// بدون این صبر، مقایسه‌ی ثانیه‌ای مساوی و ۴۰۹ هرگز رخ نمی‌داد.
// هر حالت با سرور موقت ایزوله (DB در tmpdir) تست می‌شود.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

/** جایگشت کامل ۱۱ ویجتِ شناخته‌شده — باید با WIDGET_IDS سرور یکی باشد */
const ORDER_A = [
  'welcome', 'backup', 'license', 'stats', 'progress', 'trend',
  'topParts', 'quickReport', 'recent', 'projects', 'actions',
];
const ORDER_B = [
  'actions', 'welcome', 'license', 'stats', 'progress', 'trend',
  'topParts', 'quickReport', 'recent', 'projects', 'backup',
];

interface Saved {
  ok?: boolean;
  order?: string[];
  hidden?: string[];
  updated_at?: string;
}
interface Fetched {
  order?: string[];
  hidden?: string[];
  updated_at?: string;
}
interface ConflictBody {
  error?: string;
  conflict?: boolean;
  current?: { order: string[]; hidden: string[]; updated_at: string };
}

/** صبر بیش از یک ثانیه — تا datetime('now') (دقت ثانیه‌ای) واقعاً جلوتر رود */
const oneSecondLater = () => new Promise((r) => setTimeout(r, 1100));

describe('PUT /api/dashboard/layout — قاعده‌ی تداخل ۴۰۹ با base_updated_at قدیمی', () => {
  let s: TempServer;
  let token: string;

  beforeAll(async () => {
    s = await startTempServer();
    token = await s.login('admin', 'admin123');
  }, 70_000);

  afterAll(async () => { await s?.close(); });

  it('با نوشتنِ نخستین (بدون ردیف و بدون base) → ۲۰۰ و برگرداندن updated_at به‌صورت ISO', async () => {
    // GET اول: هنوز چیزی ذخیره نشده → ۴۰۴ (کلاینت به DEFAULT_ORDER می‌رود)
    const before = await s.api<Fetched>('GET', '/api/dashboard/layout', { token });
    expect(before.status).toBe(404);

    const w = await s.api<Saved>('PUT', '/api/dashboard/layout', {
      token,
      body: { order: ORDER_A, hidden: [] },
    });
    expect(w.status).toBe(200);
    expect(w.data.ok).toBe(true);
    // ISO کامل با Z — همین فرمت مبنای مقایسه‌ی تداخل است (نه فرمت خام SQLite)
    expect(w.data.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('base برابر با وضعیت فعلی ردیف → ۲۰۰ (در همگام، تداخلی نیست) و ردیف جلو می‌رود', async () => {
    // base: نسخه‌ای که همین نشست از قبل دارد (یا تازه خوانده)
    const cur = await s.api<Fetched>('GET', '/api/dashboard/layout', { token });
    expect(cur.status).toBe(200);
    const base = cur.data.updated_at!;

    await oneSecondLater(); // ردیفِ نوشته‌ی بعدی باید واقعاً جلوتر از base باشد؟ نه — اینجا base == حال است
    const w = await s.api<Saved>('PUT', '/api/dashboard/layout', {
      token,
      body: { order: ORDER_A, hidden: ['trend'], base_updated_at: base },
    });
    expect(w.status).toBe(200); // existing == base، نه جلوتر → رد نمی‌شود
    expect(w.data.updated_at! >= base).toBe(true);
  });

  it('base قدیمی بعد از نوشتنِ نشست دیگر → ۴۰۹ با conflict و current (نسخه‌ی تازه‌ی سرور)', async () => {
    // نشست «دیگر» (دستگاه دیگر) با base درست می‌نویسد → ۲۰۰ و ردیف جلوتر می‌رود
    const cur = await s.api<Fetched>('GET', '/api/dashboard/layout', { token });
    const baseOfOther = cur.data.updated_at!;
    await oneSecondLater(); // دقت ثانیه‌ای datetime('now') — وگرنه ردیف «جلوتر» نمی‌شود
    const other = await s.api<Saved>('PUT', '/api/dashboard/layout', {
      token,
      body: { order: ORDER_B, hidden: ['trend'], base_updated_at: baseOfOther },
    });
    expect(other.status).toBe(200);
    const newStamp = other.data.updated_at!;
    expect(newStamp > baseOfOther).toBe(true); // پیش‌شرط منطقیِ ۴۰۹: ردیف از base جلوتر است

    // نشستِ اول با همان base قدیمی می‌خواهد بنویسد → باید ۴۰۹ بگیرد (تداخل واقعی)
    const res = await fetch(`${s.base}/api/dashboard/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ order: ORDER_A, hidden: [], base_updated_at: baseOfOther }),
    });
    expect(res.status).toBe(409);
    // ۴۰۹ هم مثل ۲۰۰ بدون‌کش است — پاسخ تازه نباید در کش میان‌افزار بماند
    expect(res.headers.get('cache-control')).toBe('no-store');

    const body = (await res.json()) as ConflictBody;
    expect(body.conflict).toBe(true);
    expect(body.error).toMatch(/دستگاه دیگر|تغییر/);
    // کلاینت برای بازیابی به نسخه‌ی تازه‌ی سرور از همین‌جا نیاز دارد
    expect(body.current).toBeTruthy();
    expect(body.current!.order).toEqual(ORDER_B); // نه نسخه‌ی بازنده‌ی خودش
    expect(body.current!.hidden).toEqual(['trend']);
    expect(body.current!.updated_at).toBe(newStamp);
  });

  it('بعد از ۴۰۹، ردیف بازنویسی نشده — GET همان نسخه‌ی نشست برنده را می‌دهد', async () => {
    const g = await s.api<Fetched>('GET', '/api/dashboard/layout', { token });
    expect(g.status).toBe(200);
    expect(g.data.order).toEqual(ORDER_B); // نوشتنِ بازنده اعمال نشده است
    expect(g.data.hidden).toEqual(['trend']);
    expect(g.data.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('با base تازه‌شده (نسخه‌ی سرور بعد از ۴۰۹) → ۲۰۰ — قاعده جلوی همگام‌سازی درست را نمی‌گیرد', async () => {
    const g = await s.api<Fetched>('GET', '/api/dashboard/layout', { token });
    const fresh = g.data.updated_at!; // همان نسخه‌ای که کلاینت بعد از ۴۰۹ گرفته است

    const w = await s.api<Saved>('PUT', '/api/dashboard/layout', {
      token,
      body: { order: ORDER_A, hidden: [], base_updated_at: fresh },
    });
    expect(w.status).toBe(200);
    expect(w.data.ok).toBe(true);
    expect(w.data.order).toEqual(ORDER_A); // این بار پذیرفته شد
  });

  it('بدون base_updated_at روی ردیف موجود → ۲۰۰ (قاعده‌ی ۴۰۹ فقط برای base فعال است)', async () => {
    const w = await s.api<Saved>('PUT', '/api/dashboard/layout', {
      token,
      body: { order: ORDER_B, hidden: [] },
    });
    expect(w.status).toBe(200);
    expect(w.data.ok).toBe(true);
  });
});
