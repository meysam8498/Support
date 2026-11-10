// ============================================================
// تست «چرخش کامل کلید با اسکریپت» — scripts/rotate-license-key.mjs
// -------------------------------------------------------------------
// اسکریپت در یک پوشه‌ی موقت اجرا می‌شود (--keys و --app-keys موقت) تا
// هیچ‌چیز از کلیدهای واقعی پروژه دست نخورد:
//   ۱) --dry-run هیچ فایلی نمی‌سازد
//   ۲) چرخش واقعی: کلید عمومی قدیمی → accepted_license_public_keys/
//      کلید خصوصی قدیمی → private-archive/ و retired/ نصب
//      کلید جدید در پوشه‌ی پروژه و پوشه‌ی نصب، کلیدهای پذیرفته‌شده کپی،
//      رجیستری rotations.jsonl در هر دو محل، kid جاری == آخرین new_kid
//   ۳) کد امضاشده با کلید خصوصی بایگانی‌شده با کلید عمومی پذیرفته‌شده تأیید می‌شود
//      (یعنی کدهای صادرشده‌ی قبلی معتبر می‌مانند)
//   ۴) کلید خصوصی/عمومی ناسازگار → خروج غیرصفر و بدون هیچ تغییری
//   ۵) کلید عمومی سرور منبع (server/src/lib) دست‌نخورده می‌ماند
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'rotate-license-key.mjs');
const SERVER_PEM = join(ROOT, 'server', 'src', 'lib', 'license_public_key.pem');

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

const newPair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  }) as unknown as { publicKey: string; privateKey: string };

const run = (keysDir: string, appKeys: string, extra: string[] = []) =>
  spawnSync(process.execPath, [SCRIPT, '--keys', keysDir, '--app-keys', appKeys, ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
  });

describe('اسکریپت چرخش کلید (scripts/rotate-license-key.mjs)', () => {
  let tmp: string;
  let keysDir: string;
  let appKeys: string;
  let oldPub: string;
  let oldPriv: string;
  let oldKid: string;
  let serverPemBefore: string | null;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rotate-script-'));
    keysDir = join(tmp, 'keys');
    appKeys = join(tmp, 'appkeys');
    mkdirSync(keysDir, { recursive: true });
    mkdirSync(appKeys, { recursive: true });
    const pair = newPair();
    oldPub = pair.publicKey;
    oldPriv = pair.privateKey;
    oldKid = kidOf(oldPub);
    writeFileSync(join(keysDir, 'license_private.pem'), oldPriv);
    writeFileSync(join(keysDir, 'license_public.pem'), oldPub);
    // شبیه‌سازی نصب دسکتاپ: همان جفت‌کلید قبلی آنجا هم هست
    writeFileSync(join(appKeys, 'license_private.pem'), oldPriv);
    writeFileSync(join(appKeys, 'license_public.pem'), oldPub);
    serverPemBefore = existsSync(SERVER_PEM) ? readFileSync(SERVER_PEM, 'utf8') : null;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('--dry-run هیچ فایلی نمی‌سازد و برنامه را چاپ می‌کند', () => {
    const r = run(keysDir, appKeys, ['--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(oldKid);
    expect(r.stdout).toContain('پیش‌نمایش');
    expect(existsSync(join(keysDir, 'accepted_license_public_keys'))).toBe(false);
    expect(existsSync(join(keysDir, 'private-archive'))).toBe(false);
    expect(existsSync(join(keysDir, 'rotations.jsonl'))).toBe(false);
    expect(readFileSync(join(keysDir, 'license_private.pem'), 'utf8')).toBe(oldPriv);
    expect(readdirSync(appKeys).sort()).toEqual(['license_private.pem', 'license_public.pem']);
  });

  it('چرخش واقعی: بایگانی کلید قدیمی، کلید جدید و هم‌گام‌سازی نصب', () => {
    const r = run(keysDir, appKeys);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`→`);

    const archivedPub = join(keysDir, 'accepted_license_public_keys', `license_public_${oldKid}.pem`);
    const archivedPriv = join(keysDir, 'private-archive', `license_private_${oldKid}.pem`);
    expect(readFileSync(archivedPub, 'utf8')).toBe(oldPub);
    expect(readFileSync(archivedPriv, 'utf8')).toBe(oldPriv);

    const newPriv = readFileSync(join(keysDir, 'license_private.pem'), 'utf8');
    const newPub = readFileSync(join(keysDir, 'license_public.pem'), 'utf8');
    const newKid = kidOf(newPub);
    expect(newKid).not.toBe(oldKid);
    expect(newPriv).not.toBe(oldPriv);

    // کلید عمومی جاری باید با کلید خصوصی جاری جفت باشد
    const signer = createSign('RSA-SHA256');
    signer.update('roundtrip');
    const verifier = createVerify('RSA-SHA256');
    verifier.update('roundtrip');
    expect(verifier.verify(newPub, signer.sign(newPriv, 'base64url'), 'base64url')).toBe(true);

    // رجیستری چرخش
    const registry = readFileSync(join(keysDir, 'rotations.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({ old_kid: oldKid, new_kid: newKid, by: 'rotate-license-key.mjs' });

    // پوشه‌ی کلید نصب
    expect(readFileSync(join(appKeys, 'license_private.pem'), 'utf8')).toBe(newPriv);
    expect(readFileSync(join(appKeys, 'license_public.pem'), 'utf8')).toBe(newPub);
    expect(readFileSync(join(appKeys, 'retired', `license_private_${oldKid}.pem`), 'utf8')).toBe(oldPriv);
    expect(readFileSync(join(appKeys, 'accepted_license_public_keys', `license_public_${oldKid}.pem`), 'utf8')).toBe(oldPub);
    const appRegistry = readFileSync(join(appKeys, 'rotations.jsonl'), 'utf8').trim().split('\n');
    expect(appRegistry).toHaveLength(1);

    // کلید عمومی سرور نباید با --keys غیررسمی عوض شود
    if (serverPemBefore !== null) expect(readFileSync(SERVER_PEM, 'utf8')).toBe(serverPemBefore);
  });

  it('کد امضاشده با کلید بایگانی‌شده با کلید عمومی پذیرفته‌شده تأیید می‌شود', () => {
    const r = run(keysDir, appKeys);
    expect(r.status, r.stderr).toBe(0);

    const archivedPriv = readFileSync(join(keysDir, 'private-archive', `license_private_${oldKid}.pem`), 'utf8');
    const archivedPub = readFileSync(join(keysDir, 'accepted_license_public_keys', `license_public_${oldKid}.pem`), 'utf8');
    const signer = createSign('RSA-SHA256');
    signer.update('license-payload');
    const verifier = createVerify('RSA-SHA256');
    verifier.update('license-payload');
    expect(verifier.verify(archivedPub, signer.sign(archivedPriv, 'base64url'), 'base64url')).toBe(true);
    expect(kidOf(archivedPub)).toBe(oldKid);
  });

  it('کلید خصوصی ناسازگار با عمومی → خروج غیرصفر و بدون تغییر', () => {
    const other = newPair();
    writeFileSync(join(keysDir, 'license_public.pem'), other.publicKey);
    const r = run(keysDir, appKeys);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('نمی‌خوانند');
    expect(existsSync(join(keysDir, 'accepted_license_public_keys'))).toBe(false);
    expect(readFileSync(join(keysDir, 'license_private.pem'), 'utf8')).toBe(oldPriv);
  });
});
