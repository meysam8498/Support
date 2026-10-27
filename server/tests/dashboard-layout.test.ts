// ============================================================
// تست چیدمان داشبورد کاربر (۱.۳۲) — همگام‌سازی بین دستگاه‌ها/نشست‌ها
// ------------------------------------------------------------
// • GET قبل از ذخیره → ۴۰۴ (حالت عادی اولین ورود) + updated_at
// • PUT معتبر → ۲۰۰ و GET همان محتوا را برمی‌گرداند (round-trip)
// • اعتبارسنجی سمت سرور: ویجت ناشناخته / جایگشت ناقص / مخفی تکراری → ۴۰۰
// • بدون نشست → ۴۰۱؛ جداسازی per-user: کاربر دیگر چیدمان شما را نمی‌بیند
// • تداخل (base_updated_at قدیمی) → ۴۰۹ با payload تازه‌ی سرور
// • DELETE → ردیف پاک و GET بعدی ۴۰۴ (بازگشت به پیش‌فرض برای همه‌ی دستگاه‌ها)
// همه با سرور موقت ایزوله (DB در tmpdir) — بدون دست زدن به data/ واقعی.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

/** همان ۱۱ ویجت DEFAULT_ORDER کلاینت — باید یکی باشند */
const ALL_IDS = [
  'welcome', 'backup', 'license', 'stats', 'progress', 'trend',
  'topParts', 'quickReport', 'recent', 'projects', 'actions',
] as const;

/** یک جایگشت معتبر (چرخش یکی‌شده) برای ذخیره‌ها */
const rotated = (ids: readonly string[] = ALL_IDS) => [...ids.slice(1), ids[0]];
/** جایگشت رایج تست: stats جلوتر */
const customOrder = () => ['stats', ...ALL_IDS.filter((id) => id !== 'stats')];

interface LayoutResp {
  order?: string[];
  hidden?: string[];
  updated_at?: string;
  ok?: boolean;
  conflict?: boolean;
  current?: LayoutResp;
  error?: string;
}

let s: TempServer;
let adminToken: string;
let viewerToken: string;

beforeAll(async () => {
  s = await startTempServer();
  adminToken = await s.login('admin', 'admin123');
  viewerToken = await s.login('user', 'user123');
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('GET /api/dashboard/layout', () => {
  it('بدون نشست → ۴۰۱', async () => {
    const r = await s.api<{ error?: string }>('GET', '/api/dashboard/layout');
    expect(r.status).toBe(401);
    expect(r.data.error).toBeTruthy();
  });

  it('قبل از هر ذخیره‌ای → ۴۰۴ با updated_at (کلاینت از پیش‌فرض استفاده کند)', async () => {
    const r = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: viewerToken });
    expect(r.status).toBe(404);
    expect(typeof r.data.updated_at).toBe('string');
    expect(r.data.order).toBeUndefined();
  });

  it('بعد از ذخیره → ۲۰۰ با هدر no-store', async () => {
    // اول برای این describe یک ردیف بساز (viewer خودش ذخیره می‌کند)
    const put = await s.api('PUT', '/api/dashboard/layout', {
      token: viewerToken,
      body: { order: rotated(), hidden: ['trend'] },
    });
    expect(put.status).toBe(200);

    const raw = await fetch(`${s.base}/api/dashboard/layout`, { headers: { Authorization: `Bearer ${viewerToken}` } });
    expect(raw.status).toBe(200);
    expect(raw.headers.get('cache-control')).toBe('no-store');
    const data = (await raw.json()) as LayoutResp;
    expect(data.order).toEqual([...ALL_IDS.slice(1), ALL_IDS[0]]);
    expect(data.hidden).toEqual(['trend']);
    expect(typeof data.updated_at).toBe('string');
  });
});

describe('PUT /api/dashboard/layout — اعتبارسنجی و ذخیره', () => {
  it('بدون نشست → ۴۰۱', async () => {
    const r = await s.api('PUT', '/api/dashboard/layout', {
      body: { order: ALL_IDS, hidden: [] },
    });
    expect(r.status).toBe(401);
  });

  it('ویجت ناشناخته → ۴۰۰ با پیام فارسی', async () => {
    const r = await s.api<{ error?: string; path?: string }>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: [...ALL_IDS.slice(0, 10), 'ghost-widget'], hidden: [] },
    });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/ناشناخته/);
    expect(r.data.path).toContain('order');
  });

  it('جایگشت ناقص (یکی کم) یا تکراری → ۴۰۰', async () => {
    const tooShort = await s.api<{ error?: string }>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: ALL_IDS.slice(0, 10), hidden: [] },
    });
    expect(tooShort.status).toBe(400);

    const dup = await s.api('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: [...ALL_IDS.slice(0, 10), ALL_IDS[0]], hidden: [] },
    });
    expect(dup.status).toBe(400);
  });

  it('ویجت مخفی ناشناخته/تکراری → ۴۰۰', async () => {
    const ghost = await s.api('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: [...ALL_IDS], hidden: ['nope'] },
    });
    expect(ghost.status).toBe(400);

    const dup = await s.api('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: [...ALL_IDS], hidden: ['stats', 'stats'] },
    });
    expect(dup.status).toBe(400);
  });

  it('ذخیره‌ی معتبر → ۲۰۰ و round-trip کامل با GET', async () => {
    const put = await s.api<LayoutResp>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: customOrder(), hidden: ['backup', 'license'] },
    });
    expect(put.status).toBe(200);
    expect(put.data.ok).toBe(true);
    expect(typeof put.data.updated_at).toBe('string');

    const get = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: adminToken });
    expect(get.status).toBe(200);
    expect(get.data.order).toEqual(customOrder());
    expect(get.data.hidden).toEqual(['backup', 'license']);
    expect(get.data.updated_at).toBe(put.data.updated_at);
  });

  it('upsert: دوباره ذخیره همان ردیف را به‌روز می‌کند (ردیف دوم ساخته نمی‌شود)', async () => {
    const put2 = await s.api<LayoutResp>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: rotated(), hidden: [] },
    });
    expect(put2.status).toBe(200);
    const get = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: adminToken });
    expect(get.data.order).toEqual(rotated());
  });
});

describe('جداسازی per-user + حل تداخل', () => {
  it('کاربر دیگر چیدمان شما را نمی‌بیند (جداسازی با هویت نشست، نه ورودی کلاینت)', async () => {
    // ادمین چیدمان سفارشی دارد؛ viewer نباید آن را ببیند
    const viewerView = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: viewerToken });
    expect(viewerView.status).toBe(200);
    expect(viewerView.data.order).toEqual([...ALL_IDS.slice(1), ALL_IDS[0]]); // همانِ خودش

    // تلاش برای نوشتن با user_id در بدنه بی‌اثر است — سرور از نشست می‌خواند
    const spoof = await s.api('PUT', '/api/dashboard/layout', {
      token: viewerToken,
      body: { order: customOrder(), hidden: [], user_id: 1 },
    });
    expect(spoof.status).toBe(200);
    const adminAfter = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: adminToken });
    expect(adminAfter.data.order).toEqual(rotated()); // چیدمان ادمین دست‌نخورده
  });

  it('base_updated_at قدیمی → ۴۰۹ با payload تازه‌ی سرور (آخرین-نویسنده-برنده نیست)', async () => {
    // نشست «دیگری» زودتر نوشته: اول یک PUT انجام بده تا ردیف تازه شود
    const fresh = await s.api<LayoutResp>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: customOrder(), hidden: [] },
    });
    expect(fresh.status).toBe(200);

    // حالا نشستی که از قبل (زمان قدیمی) خوانده، تغییرش را بفرستد → تداخل
    const stale = await s.api<LayoutResp>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: rotated(), hidden: ['stats'], base_updated_at: '2000-01-01 00:00:00' },
    });
    expect(stale.status).toBe(409);
    expect(stale.data.conflict).toBe(true);
    expect(stale.data.error).toMatch(/دستگاه دیگر/);
    // سرور نسخه‌ی فعلی را برمی‌گرداند تا کلاینت تصمیم بگیرد
    expect(stale.data.current?.order).toEqual(customOrder());

    // و نسخه‌ی سرور بدون تغییر مانده (بازنویسی بی‌صدا انجام نشد)
    const after = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: adminToken });
    expect(after.data.order).toEqual(customOrder());
  });

  it('base_updated_at هم‌زمان با ردیف → بدون تداخل ذخیره می‌شود', async () => {
    const cur = await s.api<LayoutResp>('GET', '/api/dashboard/layout', { token: adminToken });
    const stamp = cur.data.updated_at!;
    const put = await s.api<LayoutResp>('PUT', '/api/dashboard/layout', {
      token: adminToken,
      body: { order: rotated(), hidden: [], base_updated_at: stamp },
    });
    expect(put.status).toBe(200);
    expect(put.data.order).toEqual(rotated());
  });
});

describe('DELETE /api/dashboard/layout', () => {
  it('حذف → ۲۰۰ و GET بعدی ۴۰۴ (بازگشت به پیش‌فرض روی همه‌ی دستگاه‌ها)', async () => {
    const del = await s.api<{ ok?: boolean; deleted?: boolean; updated_at?: string }>('DELETE', '/api/dashboard/layout', { token: adminToken });
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);
    expect(del.data.deleted).toBe(true);
    expect(typeof del.data.updated_at).toBe('string');

    const get = await s.api('GET', '/api/dashboard/layout', { token: adminToken });
    expect(get.status).toBe(404);
  });

  it('حذف بدون نشست → ۴۰۱', async () => {
    const r = await s.api('DELETE', '/api/dashboard/layout');
    expect(r.status).toBe(401);
  });
});
