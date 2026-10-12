// ============================================================
// تست اندپوینت چرخش کلید امضای لایسنس (۱.۲۹) — چرخش بدون SSH از پنل ادمین
// ایزوله‌سازی: سرور موقت با ENV LICENSE_KEYS_DIR → پوشه‌ی keys آزمایشی در tmpdir؛
// هیچ فایل واقعی keys/ ریشه لمس نمی‌شود. سناریو:
//   ۱) GET  keys/status (ادمین) → kid جاری · (غیرادمین) → 403
//   ۲) صدور کد از POST issue (با کلید فعلی/tmp) → کد فعال می‌شود (201)
//   ۳) POST keys/rotate با غیرادمین → 403
//   ۴) POST keys/rotate (ادمین) → ok؛ new_kid ≠ old_kid؛ فایل بایگانی عمومی ساخته شده؛ رجیستری ثبت
//   ۵) GET keys/status → kid جاری = جدید؛ accepted شامل قدیمی
//   ۶) کدِ صادرشده‌ی پیش‌ازچرخش هنوز تأیید و «اعتبارسنجی» می‌شود (code-status ۲۰۰ با kid قدیمی)
//      و دوباره فعال‌نسده (تأیید چندکلیدی سمت سرور بعد از نوسازی حافظه)
//   ۷) صدور جدید از پنل → kid هدرِ کد جدید = کلید جدید (صدور از این پس با کلید جدید)
//   ۸) keys/ ناقص (بدون license_private.pem) → rotate → 409 راهنمادار
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createHash, createVerify } from 'node:crypto';
import { mkdtempSync, existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

let s: TempServer;
let token: string;
let tmpKeys: string;

function seedKeys(): string {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const d = mkdtempSync(join(tmpdir(), 'sem-rotkeys-'));
  writeFileSync(join(d, 'license_public.pem'), String(pair.publicKey));
  writeFileSync(join(d, 'license_private.pem'), String(pair.privateKey));
  return d;
}

/** خواندن kid از هدر کد (بدون تأیید امضا — همان منطق سرور) */
function codeKid(code: string): string {
  const h = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString('utf8'));
  return typeof h?.kid === 'string' ? h.kid : '';
}

beforeAll(async () => {
  tmpKeys = seedKeys();
  s = await startTempServer({
    LICENSE_KEYS_DIR: tmpKeys,
    // صدور از پنل هم باید همان کلید خصوصی tmp را بخواند (ENV اول از مسیر فایل)
    LICENSE_ISSUE_KEY: join(tmpKeys, 'license_private.pem'),
  });
  token = await s.login();
}, 70_000);

afterAll(async () => {
  await s?.close();
  try { if (tmpKeys) rmSync(tmpKeys, { recursive: true, force: true }); } catch { /* */ }
});

describe('چرخش کلید امضای لایسنس از اندپوینت ادمین (بدون SSH)', () => {
  it('GET keys/status — ادمین: kid جاری؛ غیرادمین: ۴۰۳', async () => {
    const r = await s.api<{ current_kid: string; accepted_kids: string[]; has_issue_key: boolean }>('GET', '/api/license/keys/status', { token });
    expect(r.status).toBe(200);
    expect(r.data.current_kid).toMatch(/^[0-9a-f]{8}$/);
    expect(r.data.has_issue_key).toBe(true);

    await s.api('POST', '/api/users', { token, body: { username: 'rotviewer', password: 'v1ewer-pass-1', full_name: 'بیننده', role: 'viewer' } });
    const vToken = await s.login('rotviewer', 'v1ewer-pass-1');
    const forbidden = await s.api('GET', '/api/license/keys/status', { token: vToken });
    expect(forbidden.status).toBe(403);
  });

  // کد پیش‌ازچرخش — صدور از پنل با کلید فعلی (tmp)
  let preCode = '';
  let preKid = '';

  it('صدور کد از پنل پیش‌ازچرخش (با کلید فعلی) → 201 با kid جاری', async () => {
    const r = await s.api<{ ok?: boolean; code?: string }>('POST', '/api/license/issue', {
      token, body: { plan: 'year', to: 'تست چرخش پنل', grouped: false },
    });
    expect(r.status).toBe(201);
    preCode = r.data.code!;
    preKid = codeKid(preCode);
    expect(preKid).toMatch(/^[0-9a-f]{8}$/);
    // تأیید امضا با کلید عمومی فعلی (پیش‌چرخش)
    const pub = readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8');
    const [h, p, sg] = preCode.split('.');
    const verified = createVerify('RSA-SHA256').update(`${h}.${p}`).end().verify(pub, Buffer.from(sg, 'base64url'));
    expect(verified).toBe(true);
  });

  it('POST keys/rotate با غیرادمین → 403', async () => {
    await s.api('POST', '/api/users', { token, body: { username: 'rotviewer2', password: 'v1ewer-pass-2', full_name: 'بیننده', role: 'viewer' } });
    const vToken = await s.login('rotviewer2', 'v1ewer-pass-2');
    const r = await s.api('POST', '/api/license/keys/rotate', { token: vToken });
    expect(r.status).toBe(403);
    // فایل‌ها دست‌نخورده: هنوز فقط یک جفت‌کلید
    expect(existsSync(join(tmpKeys, 'accepted_license_public_keys'))).toBe(false);
  });

  it('POST keys/rotate (ادمین) → ok؛ چرخش کامل + بایگانی + رجیستری + نوسازی حافظه', async () => {
    const r = await s.api<{ ok?: boolean; old_kid?: string; new_kid?: string; current_kid?: string; accepted_kids?: string[]; guide?: string[] }>(
      'POST', '/api/license/keys/rotate', { token }
    );
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.old_kid).toMatch(/^[0-9a-f]{8}$/);
    expect(r.data.new_kid).toMatch(/^[0-9a-f]{8}$/);
    expect(r.data.new_kid).not.toBe(r.data.old_kid);
    // جاری = جدید؛ پذیرفته‌شده شامل قدیمی
    expect(r.data.current_kid).toBe(r.data.new_kid);
    expect(r.data.accepted_kids).toContain(r.data.old_kid);
    expect(r.data.accepted_kids).toContain(r.data.new_kid);
    // فایل‌ها: بایگانی عمومی + خصوصی بایگانی + رجیستری
    const archivedPub = join(tmpKeys, 'accepted_license_public_keys', `license_public_${r.data.old_kid}.pem`);
    expect(existsSync(archivedPub)).toBe(true);
    expect(existsSync(join(tmpKeys, `license_private_${r.data.old_kid}.pem`))).toBe(true);
    const registry = readFileSync(join(tmpKeys, 'rotations.jsonl'), 'utf8').trim();
    const entry = JSON.parse(registry);
    expect(entry.old_kid).toBe(r.data.old_kid);
    expect(entry.new_kid).toBe(r.data.new_kid);
    // کلید جاری روی دیسک عوض شده و kid هدر کدِ صدور جدید باید kid جدید شود
    const newKidOnDisk = kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8'));
    expect(newKidOnDisk).toBe(r.data.new_kid);
  });

  it('کدِ صادرشده پیش‌ازچرخش (kid قدیمی) پس از چرخش هنوز تأیید می‌شود (code-status ۲۰۰)', async () => {
    const r = await s.api<{ jti?: string; kid?: string }>('POST', '/api/license/code-status', { token, body: { code: preCode } });
    expect(r.status).toBe(200);
    expect(r.data.kid).toBe(preKid); // تأیید با کلید پذیرفته‌شده‌ی قدیمی — کد نمی‌میرد
  });

  it('صدور جدید از پنل پس‌ازچرخش → kid هدر = کلید جدید', async () => {
    const r = await s.api<{ ok?: boolean; code?: string }>('POST', '/api/license/issue', {
      token, body: { plan: 'month', to: 'تست پس‌ازچرخش', grouped: false },
    });
    expect(r.status).toBe(201);
    expect(codeKid(r.data.code!)).not.toBe(preKid);
    expect(codeKid(r.data.code!)).toBe(kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8')));
  });

  it('keys/ ناقص (بدون license_private.pem) → rotate 409 راهنمادار; status مشخص می‌کند', async () => {
    const s2 = await startTempServer({ LICENSE_KEYS_DIR: join(tmpKeys, 'empty') }); // پوشه‌ی خالی
    const t2 = await s2.login();
    try {
      const rot = await s2.api<{ error?: string }>('POST', '/api/license/keys/rotate', { token: t2 });
      expect(rot.status).toBe(409);
      expect(rot.data.error).toContain('license_private.pem');
    } finally {
      await s2.close();
    }
  });
});
