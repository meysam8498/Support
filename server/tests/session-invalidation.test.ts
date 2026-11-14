// ============================================================
// ابطال نشست (token_version) + اجبار تغییر رمز پیش‌فرض
// سرور موقت با کلیدهای ایزوله (helpers/spawn-server.ts)؛ هیچ داده‌ی واقعی لمس نمی‌شود.
// ============================================================
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

let s: TempServer;

beforeAll(async () => {
  // REQUIRE_PASSWORD_CHANGE=1 پرچم must_change_password را روی حساب seedشده (admin123) روشن می‌کند
  s = await startTempServer({ REQUIRE_PASSWORD_CHANGE: '1' });
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('اجبار تغییر رمز پیش‌فرض', () => {
  it('login با رمز پیش‌فرض → must_change_password=true و بقیه‌ی مسیرها ۴۲۸', async () => {
    const l = await s.api<{ token?: string; must_change_password?: boolean }>('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'admin123' },
    });
    expect(l.status).toBe(200);
    expect(l.data.must_change_password).toBe(true);

    const blocked = await s.api('GET', '/api/devices', { token: l.data.token! });
    expect(blocked.status).toBe(428);
    expect((blocked.data as { must_change_password?: boolean }).must_change_password).toBe(true);

    // مسیرهای مجاز در همین حالت کار می‌کنند (وگرنه کاربر قفل می‌شد)
    const me = await s.api<{ must_change_password?: boolean }>('GET', '/api/auth/me', { token: l.data.token! });
    expect(me.status).toBe(200);
    expect(me.data.must_change_password).toBe(true);
  });

  it('تغییر رمز با رمز فعلی نادرست → ۴۰۰', async () => {
    const l = await s.api<{ token: string }>('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
    const r = await s.api('POST', '/api/auth/change-password', {
      token: l.data.token,
      body: { current_password: 'wrong-password', new_password: 'New-Strong-Pass-123' },
    });
    expect(r.status).toBe(400);
  });

  it('تغییر رمز موفق: توکن تازه کلید می‌دهد و توکن قدیمی باطل می‌شود', async () => {
    const l = await s.api<{ token: string }>('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
    const oldToken = l.data.token;

    const ch = await s.api<{ token?: string; must_change_password?: boolean }>('POST', '/api/auth/change-password', {
      token: oldToken,
      body: { current_password: 'admin123', new_password: 'New-Strong-Pass-123' },
    });
    expect(ch.status).toBe(200);
    expect(ch.data.must_change_password).toBe(false);
    expect(ch.data.token).toBeTruthy();

    // توکن قدیمی: نسخه‌ی نشست بالا رفته → ۴۰۱
    const withOld = await s.api('GET', '/api/devices', { token: oldToken });
    expect(withOld.status).toBe(401);

    // توکن تازه: دسترسی کامل، و رمز قدیمی دیگر کار نمی‌کند
    const withNew = await s.api('GET', '/api/devices', { token: ch.data.token! });
    expect(withNew.status).toBe(200);
    const reloginOld = await s.api('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
    expect(reloginOld.status).toBe(401);
  });
});

describe('ابطال نشست با تغییر نقش/غیرفعال‌سازی', () => {
  let adminToken: string;
  let userId: number;

  beforeAll(async () => {
    const l = await s.api<{ token: string }>('POST', '/api/auth/login', { body: { username: 'admin', password: 'New-Strong-Pass-123' } });
    adminToken = l.data.token;
    const c = await s.api<{ id: number }>('POST', '/api/users', {
      token: adminToken,
      body: { username: 'temp_worker', password: 'Temp-Pass-1234', full_name: 'کاربر موقت', role: 'tech' },
    });
    expect(c.status).toBe(201);
    userId = c.data.id;
  });

  it('رمز تعیین‌شده توسط ادمین مستقیم معتبر است (بدون اجبار تغییر)', async () => {
    const l = await s.api<{ token: string; must_change_password?: boolean }>('POST', '/api/auth/login', {
      body: { username: 'temp_worker', password: 'Temp-Pass-1234' },
    });
    expect(l.status).toBe(200);
    expect(l.data.must_change_password).toBe(false);
  });

  it('بازنشانی رمز توسط ادمین: نشست قدیمی باطل و ورود بعدی اجبار به تغییر رمز', async () => {
    const l = await s.api<{ token: string }>('POST', '/api/auth/login', {
      body: { username: 'temp_worker', password: 'Temp-Pass-1234' },
    });
    const oldToken = l.data.token;

    const reset = await s.api('POST', `/api/users/${userId}/reset-password`, {
      token: adminToken,
      body: { new_password: 'Reset-Pass-5678' },
    });
    expect(reset.status).toBe(200);

    // نشست قبلی فوراً باطل می‌شود
    expect((await s.api('GET', '/api/auth/me', { token: oldToken })).status).toBe(401);

    const relogin = await s.api<{ token: string; must_change_password?: boolean }>('POST', '/api/auth/login', {
      body: { username: 'temp_worker', password: 'Reset-Pass-5678' },
    });
    expect(relogin.data.must_change_password).toBe(true);
    expect((await s.api('GET', '/api/auth/me', { token: relogin.data.token! })).status).toBe(200);
    expect((await s.api('GET', '/api/devices', { token: relogin.data.token! })).status).toBe(428);
  });

  it('غیرفعال‌سازی کاربر → توکن فعلی‌اش ۴۰۱ می‌شود', async () => {
    // کاربر اختصاصی این تست — مستقل از تغییر رمز تست قبلی
    const created = await s.api<{ id: number }>('POST', '/api/users', {
      token: adminToken,
      body: { username: 'temp_deactivate', password: 'Temp-Pass-9999', full_name: 'کاربر غیرفعال‌شدنی', role: 'viewer' },
    });
    expect(created.status).toBe(201);

    const l = await s.api<{ token: string }>('POST', '/api/auth/login', {
      body: { username: 'temp_deactivate', password: 'Temp-Pass-9999' },
    });
    const userToken = l.data.token;

    expect((await s.api('GET', '/api/auth/me', { token: userToken })).status).toBe(200);

    const upd = await s.api('PUT', `/api/users/${created.data.id}`, { token: adminToken, body: { active: 0 } });
    expect(upd.status).toBe(200);

    // توکن تا انقضا زنده نمی‌ماند — وضعیت کاربر در هر درخواست خوانده می‌شود
    expect((await s.api('GET', '/api/auth/me', { token: userToken })).status).toBe(401);
  });

  it('logout-all توکن جاری را هم باطل می‌کند', async () => {
    const l = await s.api<{ token: string }>('POST', '/api/auth/login', { body: { username: 'admin', password: 'New-Strong-Pass-123' } });
    const tok = l.data.token;
    expect((await s.api('POST', '/api/auth/logout-all', { token: tok })).status).toBe(200);
    expect((await s.api('GET', '/api/auth/me', { token: tok })).status).toBe(401);
  });
});
