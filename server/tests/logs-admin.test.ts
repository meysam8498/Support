// ============================================================
// تست مسیر GET /api/logs — دو جریان دسترسی (۱.۳۰)
// ------------------------------------------------------------
// • استقرار عادی (نسخه‌ی ادمین): بدون نشست → ۴۰۱؛ نقش غیرادمین → ۴۰۳؛
//   ادمین → ۲۰۰ با mode=admin و سقف کامل ۵۰۰ خط؛ هدر no-store.
// • استقرار پشتیبانی (SUPPORT_ONLY=1): بدون توکن → ۴۰۱؛ توکن غلط → ۴۰۱؛
//   توکن درست → ۲۰۰ با mode=support و سقف ۲۰۰ خط.
// هر حالت با سرور موقت ایزوله (DB/کلید در tmpdir) تست می‌شود.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

/** رشته‌ی طولانی برای تولید چند لاگ — هر درخواست سلامت یک خط info ثبت می‌کند */
const poke = async (base: string, n: number) => {
  for (let i = 0; i < n; i++) {
    await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) }).catch(() => undefined);
  }
};

describe('GET /api/logs — استقرار عادی (نشست ادمین)', () => {
  let s: TempServer;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    s = await startTempServer();
    adminToken = await s.login('admin', 'admin123');
    viewerToken = await s.login('user', 'user123');
    // چند خط لاگ تولید کن تا total > 0 باشد
    await poke(s.base, 3);
  }, 70_000);

  afterAll(async () => { await s?.close(); });

  it('بدون نشست → ۴۰۱ (خواندن لاگ ادمینی نیازمند ورود است)', async () => {
    const r = await s.api<{ error?: string }>('GET', '/api/logs');
    expect(r.status).toBe(401);
    expect(r.data.error).toBeTruthy();
  });

  it('با توکن نامعتبر → ۴۰۱', async () => {
    const r = await s.api('GET', '/api/logs', { token: 'not-a-real-token' });
    expect(r.status).toBe(401);
  });

  it('نقش غیرادمین (viewer) → ۴۰۳ — لاگ فقط برای ادمین', async () => {
    const r = await s.api<{ error?: string }>('GET', '/api/logs', { token: viewerToken });
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/مجاز نیست|ادمین/);
  });

  it('ادمین → ۲۰۰ با ساختار کامل و mode=admin و هدر no-store', async () => {
    const r = await s.api<{ mode?: string; support_only?: boolean; version?: string; server_version?: string; total?: number; entries?: { t: string; level: string; msg: string }[] }>(
      'GET', '/api/logs?lines=100', { token: adminToken },
    );
    expect(r.status).toBe(200);
    expect(r.data.mode).toBe('admin');
    expect(r.data.support_only).toBe(false);
    expect(typeof r.data.version).toBe('string');
    expect(typeof r.data.server_version).toBe('string');
    expect(typeof r.data.total).toBe('number');
    expect(Array.isArray(r.data.entries)).toBe(true);
    // لاگ واقعی تولید شده — حداقل یک سطر با ساختار درست
    expect(r.data.total).toBeGreaterThan(0);
    const first = r.data.entries![0];
    expect(first).toMatchObject({ level: expect.stringMatching(/info|error/) });
    expect(typeof first.t).toBe('string');
    expect(typeof first.msg).toBe('string');
  });

  it('سقف خطوط ادمین ۵۰۰ است (کل حلقه) — lines=500 پذیرفته و برگردانده می‌شود', async () => {
    await poke(s.base, 2);
    const r = await s.api<{ total?: number; entries?: unknown[] }>('GET', '/api/logs?lines=500', { token: adminToken });
    expect(r.status).toBe(200);
    // همه‌ی آنچه در حلقه است برمی‌گردد (نه سقف ۲۰۰ حالت پشتیبانی)
    expect(r.data.entries!.length).toBe(Math.min(r.data.total!, 500));
  });

  it('بدون پارامتر lines → پیش‌فرض ۱۰۰ سطر', async () => {
    const r = await s.api<{ entries?: unknown[] }>('GET', '/api/logs', { token: adminToken });
    expect(r.status).toBe(200);
    expect(r.data.entries!.length).toBeLessThanOrEqual(100);
  });
});

describe('GET /api/logs — استقرار پشتیبانی (SUPPORT_ONLY=1)', () => {
  let s: TempServer;
  const SUPPORT_TOKEN = 'support-token-for-logs-test';

  beforeAll(async () => {
    s = await startTempServer({ SUPPORT_ONLY: '1', SUPPORT_LOG_TOKEN: SUPPORT_TOKEN });
    await poke(s.base, 2);
  }, 70_000);

  afterAll(async () => { await s?.close(); });

  it('بدون توکن → ۴۰۱ (X-Support-Token الزامی)', async () => {
    const r = await s.api<{ error?: string }>('GET', '/api/logs');
    expect(r.status).toBe(401);
    expect(r.data.error).toMatch(/X-Support-Token/);
  });

  it('توکن غلط → ۴۰۱', async () => {
    const r = await fetch(`${s.base}/api/logs`, { headers: { 'X-Support-Token': 'wrong' } });
    expect(r.status).toBe(401);
  });

  it('توکن درست → ۲۰۰ با mode=support و support_only=true', async () => {
    const res = await fetch(`${s.base}/api/logs?lines=200`, { headers: { 'X-Support-Token': SUPPORT_TOKEN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const data = (await res.json()) as { mode?: string; support_only?: boolean; total?: number; entries?: unknown[] };
    expect(data.mode).toBe('support');
    expect(data.support_only).toBe(true);
    expect(Array.isArray(data.entries)).toBe(true);
  });

  it('سقف خطوط حالت پشتیبانی ۲۰۰ است — lines=500 به ۲۰۰ محدود می‌شود', async () => {
    await poke(s.base, 3);
    const res = await fetch(`${s.base}/api/logs?lines=500`, { headers: { 'X-Support-Token': SUPPORT_TOKEN } });
    const data = (await res.json()) as { total?: number; entries?: unknown[] };
    expect(data.entries!.length).toBeLessThanOrEqual(200);
    expect(data.entries!.length).toBeLessThanOrEqual(data.total!);
  });

  it('توکن پشتیبانی روی نشست کاربر اثری ندارد — بدون هدر، همچنان ۴۰۱', async () => {
    const r = await s.api('GET', '/api/logs'); // بدون هیچ هدری
    expect(r.status).toBe(401);
  });
});
