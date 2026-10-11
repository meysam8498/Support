// ============================================================
// تست‌های چرخه‌ی حیاتی لایسنس — صدور، فعال‌سازی، replay، ابطال/لغو ابطال
// سرور موقت با کلید فروشنده‌ی واقعی (keys/license_private.pem کنار پروژه).
// ============================================================
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

let s: TempServer;
let token: string;

beforeAll(async () => {
  s = await startTempServer();
  token = await s.login();
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('صدور کد لایسنس (فروشنده)', () => {
  it('POST /api/license/issue → 201 با کد RS256 قابل تأیید', async () => {
    const r = await s.api<{ ok?: boolean; jti?: string; code?: string; plan?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'شرکت تست', email: 'test@example.com', note: 'فاکتور ۱۰۱', code_days: 1 },
    });
    expect(r.status).toBe(201);
    expect(r.data.ok).toBe(true);
    expect(r.data.jti).toMatch(/^[A-Z0-9-]{4,}$/);
    expect((r.data.code || '').split('.')).toHaveLength(3);
  });

  it('صدور بدون کلید/ورودی ناقص → 400 یا 503 (نه 500)', async () => {
    const r = await s.api('POST', '/api/license/issue', { token, body: { plan: 'bogus-plan' } });
    expect([400, 503]).toContain(r.status);
  });
});

describe('فعال‌سازی (خریدار) و ضد-replay', () => {
  let code: string;
  let jti: string;

  beforeAll(async () => {
    const r = await s.api<{ code?: string; jti?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'year', to: 'خریدار آزمایشی', email: 'buyer@test.ir', code_days: 1 },
    });
    code = r.data.code!;
    jti = r.data.jti!;
  });

  it('code-status پیش‌نمایش (POST) → 200 و jti یکسان', async () => {
    const r = await s.api<{ jti?: string; plan?: string }>('POST', '/api/license/code-status', { token, body: { code } });
    expect(r.status).toBe(200);
    expect(r.data.jti).toBe(jti);
    expect(r.data.plan).toBe('year');
  });

  it('activate → 201؛ پس از آن status plan=year', async () => {
    const r = await s.api<{ ok?: boolean }>('POST', '/api/license/activate', { token, body: { code } });
    expect(r.status).toBe(201);
    const st = await s.api<{ plan?: string }>('GET', '/api/license', { token });
    expect(st.data.plan).toBe('year');
  });

  it('replay همان کد → 409 (هر jti فقط یک‌بار)', async () => {
    const r = await s.api('POST', '/api/license/activate', { token, body: { code } });
    expect(r.status).toBe(409);
  });

  it('کد جعلی (امضای غلط) → 400', async () => {
    const forged = code.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
    const r = await s.api('POST', '/api/license/activate', { token, body: { code: forged } });
    expect(r.status).toBe(400);
  });
});

describe('ابطال و لغو ابطال (فروشنده)', () => {
  let code: string;
  let jti: string;

  beforeAll(async () => {
    const r = await s.api<{ code?: string; jti?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'قربانی ابطال', email: 'victim@test.ir', code_days: 1 },
    });
    code = r.data.code!;
    jti = r.data.jti!;
    const act = await s.api('POST', '/api/license/activate', { token, body: { code } });
    expect(act.status).toBe(201);
  });

  it('revoke → ok:true و known:true', async () => {
    const r = await s.api<{ ok?: boolean; known?: boolean; revoked_by?: number | null }>('POST', '/api/license/revoke', { token, body: { jti } });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.known).toBe(true);
    expect(r.data.revoked_count).toBeGreaterThanOrEqual(1); // در ستون revoked_jtis ثبت شد
  });

  it('GET /revoked شامل jti', async () => {
    const r = await s.api<{ jtis?: string[] }>('GET', '/api/license/revoked', { token });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.jtis)).toBe(true);
    expect(r.data.jtis).toContain(jti);
  });

  it('رجیستری صدور: revoked flag true از /issued', async () => {
    const r = await s.api<Array<{ jti?: string; revoked?: boolean }>>('GET', '/api/license/issued', { token });
    expect(r.status).toBe(200);
    const rows = Array.isArray(r.data) ? r.data : (r.data as { items?: Array<{ jti?: string; revoked?: boolean }> }).items || [];
    const row = rows.find((x) => x.jti === jti);
    expect(row?.revoked).toBe(true);
  });

  it('unrevoke → بازگشت وضعیت؛ /revoked دیگر جتی ندارد', async () => {
    const r = await s.api<{ ok?: boolean; revoked?: boolean }>('POST', '/api/license/unrevoke', { token, body: { jti } });
    expect(r.status).toBe(200);
    expect(r.data.revoked).toBe(false);
    const list = await s.api<{ jtis?: string[] }>('GET', '/api/license/revoked', { token });
    expect(list.data.jtis ?? []).not.toContain(jti);
  });

  it('رجیستری پس از لغو ابطال: revoked false', async () => {
    const r = await s.api<Array<{ jti?: string; revoked?: boolean }>>('GET', '/api/license/issued', { token });
    const rows = Array.isArray(r.data) ? r.data : (r.data as { items?: Array<{ jti?: string; revoked?: boolean }> }).items || [];
    const row = rows.find((x) => x.jti === jti);
    expect(row?.revoked).toBe(false);
  });
});

describe('ابطال jti ناشناخته و ورودی ناقص', () => {
  it('revoke jtiبی‌سابقه → 200 known:false (بدون crash)', async () => {
    const r = await s.api<{ known?: boolean }>('POST', '/api/license/revoke', { token, body: { jti: 'NOPE-1234' } });
    expect(r.status).toBe(200);
    expect(r.data.known).toBe(false);
  });

  it('revoke بدون ورودی → 400', async () => {
    const r = await s.api('POST', '/api/license/revoke', { token, body: {} });
    expect(r.status).toBe(400);
  });
});
