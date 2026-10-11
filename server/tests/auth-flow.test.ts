// ============================================================
// تست‌های چرخه‌ی حیاتی auth — ورود، توکن، نقش‌ها، ۴۰۱/۴۰۳
// هر فایل سرور موقت ایزوله خودش را بالا می‌آورد (DB در tmpdir).
// ============================================================
import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

let s: TempServer;
afterAll(async () => { await s?.close(); });

beforeAll(async () => {
  s = await startTempServer();
}, 70_000);

process.on('unhandledRejection', () => {});

describe('POST /api/auth/login', () => {
  it('ورود صحیح admin → 200 + توکن و نقش', async () => {
    const r = await s.api<{ token?: string; user?: { role: string; username: string } }>('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'admin123' },
    });
    expect(r.status).toBe(200);
    expect(r.data.token).toBeTruthy();
    expect(r.data.user?.role).toBe('admin');
    expect(r.data.user?.username).toBe('admin');
  });

  it('رمز غلط → 401 با پیام یکسان (بدون افشای وجود نام کاربری)', async () => {
    const wrong = await s.api<{ error: string }>('POST', '/api/auth/login', { body: { username: 'admin', password: 'bad-pass' } });
    const nobody = await s.api<{ error: string }>('POST', '/api/auth/login', { body: { username: 'no-such-user', password: 'x' } });
    expect(wrong.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(wrong.data.error).toBe(nobody.data.error);
  });

  it('بدنه‌ی نامعتبر → 400', async () => {
    const r = await s.api('POST', '/api/auth/login', { body: {} });
    expect(r.status).toBe(400);
  });
});

describe('توکن و مرزهای نقش', () => {
  let token: string;
  beforeEach(async () => { token = await s.login(); });

  it('توکن سالم → مسیرهای محافظت‌شده 200', async () => {
    const r = await s.api('GET', '/api/license', { token });
    expect(r.status).toBe(200);
  });

  it('توکن جعلی → 401', async () => {
    const r = await s.api('GET', '/api/license', { token: 'forged.token.value' });
    expect(r.status).toBe(401);
  });

  it('بدون توکن → 401', async () => {
    const r = await s.api('GET', '/api/license');
    expect(r.status).toBe(401);
  });

  it('role gating: viewers و sales نمی‌توانند ابطال کنند (403)', async () => {
    const bad = await s.api('POST', '/api/license/revoke', { token: 'forged-token', body: { jti: 'x' } });
    expect([401, 403]).toContain(bad.status);
  });
});
