// ============================================================
// تست اندپوینت‌های تأیید و بازیابی کلید قبلی از رجیستری (ادمین)
// ایزوله‌سازی: سرور موقت با ENV LICENSE_KEYS_DIR → پوشه‌ی keys آزمایشی در tmpdir؛
// هیچ فایل واقعی keys/ ریشه لمس نمی‌شود. سناریو:
//   ۱) چرخش یک‌بار → kid قدیمی (A) بایگانی می‌شود؛ کلید جاری B
//   ۲) صدور کد آزمایشی با B (برای اثبات پذیرش چندکلیدی پس از بازیابی)
//   ۳) GET  keys/rotations/:kid/verify برای A → سلامت کامل (فایل/kid/تطابق خصوصی/رجیستری)
//      قالب نادرست → 400 · ناموجود → 404 · غیرادمین → 403
//   ۴) POST keys/restore {kid:A} (ادمین) → ok؛ کلید جاری دوباره A؛ B در بایگانی ماند؛
//      رجیستری خط دوم با by=admin-panel-restore و invalid_lines=0
//   ۵) issue-test پس از بازیابی → kid=A (صدور با کلید بازیابی‌شده)؛
//      کدِ صادرشده با B در فاصله‌ی چرخش→بازیابی هنوز تأیید می‌شود (چندکلیدی)
//   ۶) restore کلید جاری → 409 · ناموجود → 404 · بدون کلید خصوصیِ بایگانی → 409 راهنمادار
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createHash, createVerify } from 'node:crypto';
import { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

let s: TempServer;
let token: string;
let vToken: string;
let tmpKeys: string;

/** kid قدیمی (A) و جاریِ پس‌ازچرخش (B) — در تست اول پر می‌شوند */
let kidA = '';
let kidB = '';
/** کد آزمایشی صادرشده با B در فاصله‌ی چرخش→بازیابی */
let midCode = '';

function seedKeys(): string {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const d = mkdtempSync(join(tmpdir(), 'sem-restore-'));
  writeFileSync(join(d, 'license_public.pem'), String(pair.publicKey));
  writeFileSync(join(d, 'license_private.pem'), String(pair.privateKey));
  return d;
}

function codeKid(code: string): string {
  const h = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString('utf8'));
  return typeof h?.kid === 'string' ? h.kid : '';
}

beforeAll(async () => {
  tmpKeys = seedKeys();
  s = await startTempServer({
    LICENSE_KEYS_DIR: tmpKeys,
    LICENSE_ISSUE_KEY: join(tmpKeys, 'license_private.pem'),
  });
  token = await s.login();
  await s.api('POST', '/api/users', { token, body: { username: 'restoreviewer', password: 'v1ewer-pass-9', full_name: 'بیننده', role: 'viewer' } });
  vToken = await s.login('restoreviewer', 'v1ewer-pass-9');
}, 70_000);

afterAll(async () => {
  await s?.close();
  try { if (tmpKeys) rmSync(tmpKeys, { recursive: true, force: true }); } catch { /* */ }
});

describe('تأیید و بازیابی کلید قبلی از رجیستری (اندپوینت ادمین)', () => {
  it('چرخش اولیه → کلید جاری B و کلید قدیمی A بایگانی می‌شود', async () => {
    const r = await s.api<{ ok?: boolean; old_kid?: string; new_kid?: string }>('POST', '/api/license/keys/rotate', { token });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    kidA = r.data.old_kid!;
    kidB = r.data.new_kid!;
    expect(kidA).toMatch(/^[0-9a-f]{8}$/);
    expect(kidB).toMatch(/^[0-9a-f]{8}$/);
    expect(kidA).not.toBe(kidB);
    expect(existsSync(join(tmpKeys, 'accepted_license_public_keys', `license_public_${kidA}.pem`))).toBe(true);
    expect(existsSync(join(tmpKeys, `license_private_${kidA}.pem`))).toBe(true);
  });

  it('کد آزمایشی با کلید B صادر می‌شود (برای اثبات پذیرش پس از بازیابی)', async () => {
    const r = await s.api<{ ok?: boolean; code?: string; kid?: string | null }>('POST', '/api/license/issue-test', { token });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.kid).toBe(kidB);
    midCode = r.data.code!;
    expect(midCode).toBeTruthy();
  });

  interface Verify {
    ok: boolean; kid: string; in_registry: boolean; registry_rotated_at: string | null; registry_by: string | null;
    is_current: boolean; public_found: boolean; public_path: string | null; public_kid_matches: boolean | null;
    private_found: boolean; private_path: string | null; private_matches_public: boolean | null; error?: string;
  }

  it('GET keys/rotations/:kid/verify برای A → سلامت کامل بایگانی؛ خطاها/دسترسی‌ها', async () => {
    const r = await s.api<Verify>('GET', `/api/license/keys/rotations/${kidA}/verify`, { token });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.kid).toBe(kidA);
    expect(r.data.in_registry).toBe(true);      // در rotations.jsonl ثبت شده
    expect(r.data.is_current).toBe(false);      // هنوز B جاری است
    expect(r.data.public_found).toBe(true);
    expect(r.data.public_kid_matches).toBe(true);
    expect(r.data.private_found).toBe(true);
    expect(r.data.private_matches_public).toBe(true);
    expect(r.data.error).toBeUndefined();
    expect(Date.parse(r.data.registry_rotated_at!)).not.toBeNaN();

    // قالب نادرست → 400
    const bad = await s.api<{ error?: string }>('GET', '/api/license/keys/rotations/short/verify', { token });
    expect(bad.status).toBe(400);
    expect(bad.data.error).toContain('kid');
    // ناموجود → 404
    const missing = await s.api<{ error?: string }>('GET', '/api/license/keys/rotations/ffffffff/verify', { token });
    expect(missing.status).toBe(404);
    // غیرادمین → 403
    const forbidden = await s.api('GET', `/api/license/keys/rotations/${kidA}/verify`, { token: vToken });
    expect(forbidden.status).toBe(403);
  });

  it('POST keys/restore با غیرادمین → 403 (کلیدها دست‌نخورده)', async () => {
    const before = kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8'));
    const r = await s.api('POST', '/api/license/keys/restore', { token: vToken, body: { kid: kidA } });
    expect(r.status).toBe(403);
    expect(kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8'))).toBe(before);
  });

  it('POST keys/restore {kid:A} → بازیابی کامل؛ کلید جاری دوباره A؛ B در بایگانی ماند', async () => {
    const r = await s.api<{
      ok?: boolean; restored_kid?: string; previous_kid?: string | null; previous_backed_up_as?: { public: string | null; private: string | null };
      current_kid?: string; accepted_kids?: string[]; guide?: string[];
    }>('POST', '/api/license/keys/restore', { token, body: { kid: kidA } });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.restored_kid).toBe(kidA);
    expect(r.data.previous_kid).toBe(kidB);
    // کلید جاری روی دیسک = A و حافظه‌ی تأیید هم نوسازی شده
    expect(kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8'))).toBe(kidA);
    expect(r.data.current_kid).toBe(kidA);
    expect(r.data.accepted_kids).toContain(kidA);
    expect(r.data.accepted_kids).toContain(kidB); // کلید عوض‌شده همچنان پذیرفته
    // کلیدهای جاریِ عوض‌شده (B) بایگانی شدند — هیچ‌چیز از دست نرفت
    expect(r.data.previous_backed_up_as.public).toContain(`license_public_${kidB}.pem`);
    expect(existsSync(join(tmpKeys, 'accepted_license_public_keys', `license_public_${kidB}.pem`))).toBe(true);
    expect(existsSync(join(tmpKeys, `license_private_${kidB}.pem`))).toBe(true);
    expect(r.data.guide?.length).toBeGreaterThan(0);

    // تأیید مجدد A حالا is_current=true
    const v = await s.api<Verify>('GET', `/api/license/keys/rotations/${kidA}/verify`, { token });
    expect(v.data.ok).toBe(true);
    expect(v.data.is_current).toBe(true);
  });

  it('پس از بازیابی: صدور با A؛ کدِ صادرشده با B در فاصله‌ی چرخش هنوز تأیید می‌شود', async () => {
    const issue = await s.api<{ ok?: boolean; kid?: string | null; code?: string }>('POST', '/api/license/issue-test', { token });
    expect(issue.status).toBe(200);
    expect(issue.data.ok).toBe(true);
    expect(issue.data.kid).toBe(kidA); // صدور از این پس با کلید بازیابی‌شده

    // کد واسط (با B امضا شده) — تأیید چندکلیدی زنده‌ست
    const st = await s.api<{ valid?: boolean; kid?: string | null }>('POST', '/api/license/code-status', { token, body: { code: midCode } });
    expect(st.status).toBe(200);
    expect(st.data.valid).toBe(true);
    expect(st.data.kid).toBe(kidB);

    // و امضا هم با کلید عمومی بایگانی‌شده‌ی B درست تأیید می‌شود
    const pubB = readFileSync(join(tmpKeys, 'accepted_license_public_keys', `license_public_${kidB}.pem`), 'utf8');
    const [h, p, sg] = midCode.split('.');
    const verified = createVerify('RSA-SHA256').update(`${h}.${p}`).end().verify(pubB, Buffer.from(sg, 'base64url'));
    expect(verified).toBe(true);
  });

  it('رجیستری: خط دوم بازیابی (restored) — تاریخچه سالم و بدون سطر خراب', async () => {
    interface Hist { count: number; invalid_lines: number; current_kid: string | null; rotations: { old_kid: string; new_kid: string; by?: string; restored?: boolean }[] }
    const r = await s.api<Hist>('GET', '/api/license/keys/rotations', { token });
    expect(r.status).toBe(200);
    expect(r.data.count).toBe(2); // چرخش + بازیابی
    expect(r.data.invalid_lines).toBe(0); // قالب بازیابی هم خط رجیستریِ معتبر است
    const latest = r.data.rotations[0];
    expect(latest.by).toBe('admin-panel-restore');
    expect(latest.restored).toBe(true);
    expect(latest.old_kid).toBe(kidB);
    expect(latest.new_kid).toBe(kidA);
    expect(r.data.current_kid).toBe(kidA);
  });

  it('گیت‌های ایمنی: restore کلید جاری → 409 · ناموجود → 404 · بدون کلید خصوصیِ بایگانی → 409 راهنمادار', async () => {
    // کلید جاری خودش
    const current = await s.api<{ error?: string }>('POST', '/api/license/keys/restore', { token, body: { kid: kidA } });
    expect(current.status).toBe(409);
    expect(current.data.error).toContain('جاری');

    // ناموجود
    const missing = await s.api<{ error?: string }>('POST', '/api/license/keys/restore', { token, body: { kid: 'ffffffff' } });
    expect(missing.status).toBe(404);

    // قالب نادرست
    const bad = await s.api('POST', '/api/license/keys/restore', { token, body: { kid: 'not-a-kid' } });
    expect(bad.status).toBe(400);

    // نبودِ کلید خصوصیِ بایگانی → بازیابی نیمه‌کاره ممنوع (عمومی موجود، خصوصی ندارد)
    unlinkSync(join(tmpKeys, `license_private_${kidB}.pem`));
    const noPriv = await s.api<{ error?: string }>('POST', '/api/license/keys/restore', { token, body: { kid: kidB } });
    expect(noPriv.status).toBe(409);
    expect(noPriv.data.error).toContain('جفت‌کلید'); // گیتِ جفت‌کلید کامل
    expect(noPriv.data.error).toContain('خصوصی: ندارد');
    // کلید جاری دست‌نخورده ماند (A)
    expect(kidOf(readFileSync(join(tmpKeys, 'license_public.pem'), 'utf8'))).toBe(kidA);

    // verify عمومیِ بدون خصوصی: فایل سالم است ولی تطابق خصوصی null (با فاصله)
    const v = await s.api<Verify>('GET', `/api/license/keys/rotations/${kidB}/verify`, { token });
    expect(v.status).toBe(200);
    expect(v.data.public_found).toBe(true);
    expect(v.data.public_kid_matches).toBe(true);
    expect(v.data.private_found).toBe(false);
    expect(v.data.private_matches_public).toBeNull();
  });
});
