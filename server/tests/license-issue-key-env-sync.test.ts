// ============================================================
// تست هم‌گام‌ماندن کلید صدور با چرخش/بازیابی وقتی کلید به‌صورت «محتوا» در
// LICENSE_ISSUE_KEY است (همان کاری که نصب دسکتاپ فروشنده می‌کند).
// باگ قبلی: پس از POST keys/rotate یا keys/restore، فایل‌های keys/ عوض می‌شدند ولی
// محتوای ENV کهنه می‌ماند؛ صدور تا ری‌استارت اپ با کلید قبلی امضا می‌شد و kid هدرِ
// کد با current_kid گزارش‌شده نمی‌خواند.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) =>
  createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const PUB = String(pair.publicKey);
const PRIV = String(pair.privateKey);
const KID = kidOf(PUB);

let s: TempServer;
let token: string;
let tmpKeys: string;

const codeKid = (code: string): string => {
  const h = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString('utf8'));
  return typeof h?.kid === 'string' ? h.kid : '';
};

beforeAll(async () => {
  tmpKeys = join(mkdtempSync(join(tmpdir(), 'sem-envsync-')), 'keys');
  mkdirSync(tmpKeys, { recursive: true });
  writeFileSync(join(tmpKeys, 'license_public.pem'), PUB);
  writeFileSync(join(tmpKeys, 'license_private.pem'), PRIV);
  s = await startTempServer({
    LICENSE_KEYS_DIR: tmpKeys,
    LICENSE_ISSUE_KEY: PRIV, // محتوا، نه مسیر — مثل نصب دسکتاپ فروشنده
    // LICENSE_PUBLIC_KEY عمداً تنظیم نمی‌شود: نصب دسکتاپ هم آن را نمی‌دهد؛ وگرنه
    // کلید عمومی جاری قفل می‌شد و چرخش در current_kid دیده نمی‌شد.
  });
  token = await s.login();
}, 70_000);

afterAll(async () => {
  await s?.close();
  try { if (tmpKeys) rmSync(tmpKeys, { recursive: true, force: true }); } catch { /* */ }
});

describe('کلید صدورِ محتوایی با چرخش و بازیابی از پنل هم‌گام می‌ماند', () => {
  it('پیش از چرخش، کد با کلید جاری امضا می‌شود', async () => {
    const r = await s.api<{ code?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'پیش‌ازچرخش', code_days: 30 },
    });
    expect(r.status).toBe(201);
    expect(codeKid(r.data.code!)).toBe(KID);
  });

  it('بلافاصله پس از چرخش، صدور با کلید جدید امضا می‌شود (بدون ری‌استارت)', async () => {
    const rot = await s.api<{ new_kid?: string; current_kid?: string }>('POST', '/api/license/keys/rotate', { token });
    expect(rot.status).toBe(200);
    const newKid = rot.data.new_kid!;
    expect(newKid).not.toBe(KID);
    expect(rot.data.current_kid).toBe(newKid);

    const r = await s.api<{ code?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'پس‌ازچرخش', code_days: 30 },
    });
    expect(r.status).toBe(201);
    // بدون هم‌گام‌سازی ENV، این‌جا kid قدیمی برمی‌گشت
    expect(codeKid(r.data.code!)).toBe(newKid);
  });

  it('پس از بازیابی کلید قبلی، صدور دوباره با همان کلید انجام می‌شود', async () => {
    const res = await s.api<{ restored_kid?: string; current_kid?: string }>('POST', '/api/license/keys/restore', {
      token,
      body: { kid: KID },
    });
    expect(res.status).toBe(200);
    expect(res.data.restored_kid).toBe(KID);
    expect(res.data.current_kid).toBe(KID);

    const r = await s.api<{ code?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'پس‌ازبازیابی', code_days: 30 },
    });
    expect(r.status).toBe(201);
    expect(codeKid(r.data.code!)).toBe(KID);

    // کد با کلید جاری هم قابل تأیید است (تأیید چندکلیدی دست‌نخورده)
    const st = await s.api<{ valid?: boolean }>('POST', '/api/license/code-status', {
      token,
      body: { code: r.data.code! },
    });
    expect(st.data.valid).toBe(true);
  });
});
