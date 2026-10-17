// ============================================================
// تست «بازیابی کلید قبلی از رجیستری چرخش» (keys/rotations.jsonl)
// -------------------------------------------------------------------
// دو بخش:
//   ۱) سناریوی ایزوله (همیشه اجرا): چرخش واقعی از اندپوینت ادمین روی
//      keys موقت → بازسازی کامل «کلید قبلی» فقط از رجیستری rotations.jsonl
//      (old_kid + archived_pub + بایگانی license_private_<old_kid>.pem)
//      → راستی‌آزمایی زوج‌بودن (مشتق عمومی == بایگانی عمومی، kid برابر)
//      → امضای کد لایسنس با کلید بازسازی‌شده و تأیید زنده توسط سرور (code-status ۲۰۰
//        با kid قدیمی) + حالت منفی (کلید ناشناس → 400).
//   ۲) رجیستری واقعی پروژه keys/rotations.jsonl (اگر موجود با.skip؛ در CI
//      keys/ گیت‌نادیده است): هر سطر → فایل بایگانی عمومی موجود، kid == old_kid؛
//      بایگانی خصوصی موجود → مشتق عمومی == بایگانی + امضای آزمایشی round-trip؛
//      سطر آخر: new_kid == kid کلید جاری keys/license_public.pem.
// هیچ فایلی نوشته/حذف نمی‌شود — فقط خواندن (بخش ۲) یا روی tmpdir (بخش ۱).
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createSign, createVerify, createPublicKey, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_REGISTRY = join(ROOT, 'keys', 'rotations.jsonl');
const REAL_KEYS_DIR = join(ROOT, 'keys');

interface RotationEntry {
  rotated_at: string;
  old_kid: string;
  new_kid: string;
  archived_pub: string;
  by?: string;
}

function readRegistry(file: string): RotationEntry[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      let e: RotationEntry;
      try { e = JSON.parse(l) as RotationEntry; } catch (err) {
        throw new Error(`سطر ${i + 1} رجیستری JSON نیست: ${(err as Error).message}`);
      }
      return e;
    });
}

/** کد JWT امضاشده — همان ساختار کد واقعی لایسنس (header با kid) */
function makeToken(privPem: string, pubPem: string, jti: string, plan = 'year'): string {
  const kid = kidOf(pubPem);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ jti, plan, to: 'تست بازیابی', iat: now, exp: now + 86400 })).toString('base64url');
  const s = createSign('RSA-SHA256');
  s.update(`${header}.${payload}`);
  return `${header}.${payload}.${s.sign(privPem, 'base64url')}`;
}

function codeKid(code: string): string {
  const h = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString('utf8'));
  return typeof h?.kid === 'string' ? h.kid : '';
}

// ============================================================
// بخش ۱ — بازیابی از رجیستری پس از چرخش واقعی (ایزوله)
// ============================================================
describe('بازیابی کلید قبلی از رجیستری چرخش (ایزوله)', () => {
  let s: TempServer;
  let token: string;
  let tmpKeys: string;
  let oldKid = '';
  let newKid = '';

  beforeAll(async () => {
    // keys اولیه = «کلید قبلی» که بعد از چرخش باید از رجیستری بازیابی شود
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    tmpKeys = mkdtempSync(join(tmpdir(), 'sem-recovery-'));
    writeFileSync(join(tmpKeys, 'license_public.pem'), String(pair.publicKey));
    writeFileSync(join(tmpKeys, 'license_private.pem'), String(pair.privateKey));
    oldKid = kidOf(String(pair.publicKey));

    s = await startTempServer({ LICENSE_KEYS_DIR: tmpKeys, LICENSE_ISSUE_KEY: join(tmpKeys, 'license_private.pem') });
    token = await s.login();
    const rot = await s.api<{ ok?: boolean; old_kid?: string; new_kid?: string }>(
      'POST', '/api/license/keys/rotate', { token }
    );
    expect(rot.status).toBe(200);
    expect(rot.data.ok).toBe(true);
    expect(rot.data.old_kid).toBe(oldKid);
    newKid = rot.data.new_kid!;
  }, 70_000);

  afterAll(async () => {
    await s?.close();
    try { if (tmpKeys) rmSync(tmpKeys, { recursive: true, force: true }); } catch { /* */ }
  });

  it('رجیستری rotations.jsonl ساخته شده و سطر چرخش کامل است', () => {
    const regFile = join(tmpKeys, 'rotations.jsonl');
    expect(existsSync(regFile)).toBe(true);
    const entries = readRegistry(regFile);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.old_kid).toBe(oldKid);
    expect(e.new_kid).toBe(newKid);
    expect(e.old_kid).not.toBe(e.new_kid);
    expect(Date.parse(e.rotated_at)).not.toBeNaN();
  });

  it('بازسازی کلید قبلی فقط از رجیستری: مشتق عمومی از بایگانی خصوصی == بایگانی عمومی', () => {
    const e = readRegistry(join(tmpKeys, 'rotations.jsonl'))[0];

    // مسیر بایگانی عمومی: از فیلد archived_pub خودِ رجیستری
    expect(existsSync(e.archived_pub)).toBe(true);
    const archivedPub = readFileSync(e.archived_pub, 'utf8');
    expect(kidOf(archivedPub)).toBe(e.old_kid);

    // بایگانی خصوصی: نام‌گذاری متناظر old_kid
    const archivedPrivPath = join(tmpKeys, `license_private_${e.old_kid}.pem`);
    expect(existsSync(archivedPrivPath)).toBe(true);
    const archivedPriv = readFileSync(archivedPrivPath, 'utf8');

    // مشتق عمومی از خصوصیِ بازسازی‌شده باید == عمومی بایگانی (این یعنی زوج کامل بازیابی شد)
    const derivedPub = String(createPublicKey(archivedPriv).export({ type: 'spki', format: 'pem' }));
    expect(kidOf(derivedPub)).toBe(e.old_kid);
    expect(derivedPub.replace(/\r/g, '').trim()).toBe(archivedPub.replace(/\r/g, '').trim());

    // امضای آزمایشی با زوج بازسازی‌شده
    const s1 = createSign('RSA-SHA256').update('recovery-probe').sign(archivedPriv);
    const v = createVerify('RSA-SHA256').update('recovery-probe');
    expect(v.verify(archivedPub, s1)).toBe(true);
    // و امضای کلید ناشناس با همان بایگانی رد می‌شود
    const rogue = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const rogueSig = createSign('RSA-SHA256').update('recovery-probe').sign(String(rogue.privateKey));
    const v2 = createVerify('RSA-SHA256').update('recovery-probe');
    expect(v2.verify(archivedPub, rogueSig)).toBe(false);
  });

  it('کد لایسنس امضاشده با کلید بازسازی‌شده → سرور زنده تأیید می‌کند (code-status ۲۰۰ با kid قدیمی)', async () => {
    const e = readRegistry(join(tmpKeys, 'rotations.jsonl'))[0];
    const priv = readFileSync(join(tmpKeys, `license_private_${e.old_kid}.pem`), 'utf8');
    const pub = readFileSync(e.archived_pub, 'utf8');
    const code = makeToken(priv, pub, 'RECOVER01');

    const r = await s.api<{ valid?: boolean; kid?: string | null; jti?: string; plan?: string }>(
      'POST', '/api/license/code-status', { token, body: { code } }
    );
    expect(r.status).toBe(200);
    expect(r.data.valid).toBe(true);
    expect(r.data.kid).toBe(e.old_kid); // تأیید چندکلیدی با کلید بازیابی‌شده
    expect(r.data.jti).toBe('RECOVER01');
    expect(r.data.plan).toBe('year');
  });

  it('حالت منفی: کد با کلید ناشناس → 400 و کد دستکاری‌شده → 400', async () => {
    const rogue = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const bad = makeToken(String(rogue.privateKey), String(rogue.publicKey), 'ROGUE999');
    const r1 = await s.api('POST', '/api/license/code-status', { token, body: { code: bad } });
    expect(r1.status).toBe(400);

    // کد معتبرِ بازیابی‌شده که payload آن بعد از امضا عوض شده
    const e = readRegistry(join(tmpKeys, 'rotations.jsonl'))[0];
    const priv = readFileSync(join(tmpKeys, `license_private_${e.old_kid}.pem`), 'utf8');
    const tampered = makeToken(priv, readFileSync(e.archived_pub, 'utf8'), 'TAMPERED1')
      .replace(/^(.*?\.)[A-Za-z0-9_-]+(\.)/, (_m, a, b) => `${a}${Buffer.from(JSON.stringify({ jti: 'TAMPERED1', plan: 'lifetime' })).toString('base64url')}${b}`);
    const r2 = await s.api('POST', '/api/license/code-status', { token, body: { code: tampered } });
    expect(r2.status).toBe(400);
  });
});

// ============================================================
// بخش ۲ — رجیستری واقعی پروژه keys/rotations.jsonl (فقط‌خواندنی)
// ============================================================
const hasRealRegistry = existsSync(REAL_REGISTRY);

describe('رجیستری واقعی keys/rotations.jsonl — بازسازی و تأیید کلید قبلی', () => {
  it.skipIf(!hasRealRegistry)('هر سطر: فایل بایگانی عمومی موجود و kid == old_kid', () => {
    const entries = readRegistry(REAL_REGISTRY);
    expect(entries.length).toBeGreaterThan(0);
    for (const [i, e] of entries.entries()) {
      expect(e.old_kid, `سطر ${i + 1}: old_kid`).toMatch(/^[0-9a-f]{8}$/);
      expect(e.new_kid, `سطر ${i + 1}: new_kid`).toMatch(/^[0-9a-f]{8}$/);
      expect(e.old_kid, `سطر ${i + 1}`).not.toBe(e.new_kid);
      expect(Date.parse(e.rotated_at), `سطر ${i + 1}: rotated_at`).not.toBeNaN();

      // archived_pub ممکن است مسیر مطلق ماشین صادرکننده باشد — fallback به نام kid در پوشه‌ی بایگانی
      const candidates = [
        e.archived_pub,
        join(REAL_KEYS_DIR, 'accepted_license_public_keys', `license_public_${e.old_kid}.pem`),
        join(REAL_KEYS_DIR, `license_public_${e.old_kid}.pem`),
      ];
      const resolved = candidates.find((p) => existsSync(p));
      expect(resolved, `سطر ${i + 1}: فایل بایگانی عمومی ${e.old_kid}`).toBeTruthy();
      const pub = readFileSync(resolved!, 'utf8');
      expect(kidOf(pub), `سطر ${i + 1}: kid بایگانی عمومی`).toBe(e.old_kid);
    }
  });

  it.skipIf(!hasRealRegistry)('بایگانی خصوصی موجود → مشتق عمومی == بایگانی عمومی + امضای round-trip', () => {
    const entries = readRegistry(REAL_REGISTRY);
    let checked = 0;
    for (const e of entries) {
      const privPath = join(REAL_KEYS_DIR, `license_private_${e.old_kid}.pem`);
      if (!existsSync(privPath)) continue; // بایگانی خصوصی ممکن است فقط نزد صادرکننده باشد
      const pubPath = [
        e.archived_pub,
        join(REAL_KEYS_DIR, 'accepted_license_public_keys', `license_public_${e.old_kid}.pem`),
        join(REAL_KEYS_DIR, `license_public_${e.old_kid}.pem`),
      ].find((p) => existsSync(p));
      expect(pubPath, `بایگانی عمومی ${e.old_kid}`).toBeTruthy();

      const priv = readFileSync(privPath, 'utf8');
      const pub = readFileSync(pubPath!, 'utf8');
      const derived = String(createPublicKey(priv).export({ type: 'spki', format: 'pem' }));
      expect(kidOf(derived), `kid مشتق از خصوصی ${e.old_kid}`).toBe(e.old_kid);
      expect(derived.replace(/\r/g, '').trim()).toBe(pub.replace(/\r/g, '').trim());

      const sig = createSign('RSA-SHA256').update(`recovery-${e.old_kid}`).sign(priv);
      const v = createVerify('RSA-SHA256').update(`recovery-${e.old_kid}`);
      expect(v.verify(pub, sig), `round-trip امضا ${e.old_kid}`).toBe(true);
      checked++;
    }
    expect(checked, 'دست‌کم یک زوج کامل خصوصی/عمومی در بایگانی بازیابی شد').toBeGreaterThan(0);
  });

  it.skipIf(!hasRealRegistry)('کلید جاری license_public.pem == new_kid سطر آخر رجیستری', () => {
    const entries = readRegistry(REAL_REGISTRY);
    const last = entries[entries.length - 1];
    const currentPath = join(REAL_KEYS_DIR, 'license_public.pem');
    expect(existsSync(currentPath)).toBe(true);
    expect(kidOf(readFileSync(currentPath, 'utf8'))).toBe(last.new_kid);
  });

  it.skipIf(!hasRealRegistry)('کد امضاشده با کلید قدیمیِ بازسازی‌شده‌ی واقعی از نظر رمزنگاری معتبر است', async () => {
    // بدون سرور و بدون لمس DB: فقط راستی‌آزمایی رمزنگاریِ زوج بازیابی‌شده
    const entries = readRegistry(REAL_REGISTRY);
    const e = entries[0];
    const privPath = join(REAL_KEYS_DIR, `license_private_${e.old_kid}.pem`);
    const pubPath = [
      e.archived_pub,
      join(REAL_KEYS_DIR, 'accepted_license_public_keys', `license_public_${e.old_kid}.pem`),
      join(REAL_KEYS_DIR, `license_public_${e.old_kid}.pem`),
    ].find((p) => existsSync(p));
    expect(existsSync(privPath), `بایگانی خصوصی ${e.old_kid}`).toBe(true);
    expect(pubPath).toBeTruthy();

    const code = makeToken(readFileSync(privPath, 'utf8'), readFileSync(pubPath!, 'utf8'), 'REALRECOVER');
    expect(codeKid(code)).toBe(e.old_kid);

    // همان الگوریتم تأیید سرور: jwt.verify با کلید عمومی بازسازی‌شده
    const jwtMod = (await import('jsonwebtoken')).default;
    const decoded = jwtMod.verify(code, readFileSync(pubPath!, 'utf8'), { algorithms: ['RS256'] }) as { jti?: string };
    expect(decoded.jti).toBe('REALRECOVER');
  });
});