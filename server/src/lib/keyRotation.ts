// ============================================================
// چرخش کلید امضای لایسنس — نسخه‌ی درون‌سروری برای اندپوینت ادمین (۱.۲۹)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// همان منطق scripts/make-license-code.mjs --rotate-keys ولی بدون SSH:
//   ۱) کلید عمومی جاری → keys/accepted_license_public_keys/license_public_<kid>.pem
//   ۲) کلید خصوصی جاری → keys/license_private_<kid>.pem (بایگانی)
//   ۳) جفت‌کلید جدید RS256 2048-bit تولید و جایگزین:
//        keys/license_public.pem   (عمومی جدید — صدور آینده)
//        keys/license_private.pem  (خصوصی جدید — صدور آینده)
//   ۴) ثبت در رجیستری keys/rotations.jsonl
//   ۵) نوسازی حافظه‌ی ماژول licenseCode (کش ACCEPTED_KEYS/CURRENT_PEM) —
//      بدون ری‌استارت سرور؛ کدهای صادرشده با کلید قبلی تا پایان exp معتبر می‌مانند
//      (تأیید چندکلیدی با kid).
// اجبارها:
//   • کلید خصوصی صدور فقط از فایل keys/license_private.pem (یا ENV LICENSE_ISSUE_KEY
//     میسر فایل) می‌آید — اگر کلید خصوصی ENVی ناشناس/غیرفایلی باشد، چرخش سمت سرور
//     انجام نمی‌شود (چون archivos‌کردن محلی آن بی‌فایده است) و خطای راهنمادار می‌دهد.
//   • عملیات اتمی در حد ممکن: ابتدا همه‌چیز محاسبه، بعد نوشتن فایل‌ها؛
//     خطای نیمه‌کاره با پرچم rollback در پاسخ گزارش می‌شود.
// ============================================================
import { generateKeyPairSync, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicKid, reloadAcceptedKeys } from './licenseCode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * پوشه‌ی keys — به‌ترتیب:
 *   ۱) ENV LICENSE_KEYS_DIR (مسیر صریح — تست و نصب‌های سفارشی)
 *   ۲) keys/ کنار CWD (اجرای خدمت/داکر در ریشه‌ی نصب)
 *   ۳) keys/ ریشه‌ی پروژه (نسبت به این ماژول — از src و dist یکسان)
 */
export function keysDir(): string {
  const fromEnv = process.env.LICENSE_KEYS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const here = join(__dirname, '..', '..', '..', 'keys');
  return existsSync(join(process.cwd(), 'keys')) ? join(process.cwd(), 'keys') : here;
}

export interface KeyRotationResult {
  ok: boolean;
  old_kid: string;
  new_kid: string;
  accepted_kids: string[];
  current_kid: string;
  archived_pub_path: string;
  registry_path: string;
  rotated_at: string;
}

export class KeyRotationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'KeyRotationError';
  }
}

/** وضعیت فعلی کلیدها برای GET (بدون انجام هیچ عملیاتی) */
export function keyStatus(): {
  current_kid: string;
  accepted_kids: string[];
  accepted_count: number;
  has_issue_key: boolean;
  keys_dir: string;
} {
  const dir = keysDir();
  return {
    current_kid: currentKid(),
    accepted_kids: acceptedKids(),
    accepted_count: 0,
    has_issue_key: existsSync(join(dir, 'license_private.pem')),
    keys_dir: dir,
  };
}

// پیاده‌سازی بدون وابستگی به سرویس‌الداری داخلی licenseCode — خواندن جاری/پذیرفته‌شده‌ها از خود ماژول
function currentKid(): string {
  const pem = readCurrentPublicPem();
  return publicKid(pem);
}

function acceptedKids(): string[] {
  const list: string[] = [];
  const dir = keysDir();
  try {
    for (const f of readdirSafe(join(dir, 'accepted_license_public_keys'))) {
      if (f === 'license_public.pem') continue;
      const kid = /license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1];
      if (kid) list.push(kid);
    }
  } catch { /* پوشه نیست */ }
  try {
    for (const f of readdirSafe(dir)) {
      if (f === 'license_public.pem') continue;
      const kid = /license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1];
      if (kid) list.push(kid);
    }
  } catch { /* */ }
  return [...new Set([...list, currentKid()])];
}

function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

function readCurrentPublicPem(): string {
  const dir = keysDir();
  for (const p of [join(dir, 'license_public.pem'), join(dir, 'license_public_key.pem')]) {
    try { return readFileSync(p, 'utf8'); } catch { /* بعدی */ }
  }
  // آخرین گزینه — همان منطق licenseCode (فایل کنار سورس داخل build)
  try { return readFileSync(join(__dirname, 'license_public_key.pem'), 'utf8'); } catch { /* */ }
  throw new KeyRotationError('کلید عمومی جاری یافت نشد (keys/license_public.pem).', 503);
}

/**
 * چرخش کلید امضا — از داخل سرور، بدون SSH.
 * پس از موفقیت، حافظه‌ی تأیید ماژول licenseCode نوسازی می‌شود (reloadAcceptedKeys)
 * و کد جدید باید بلافاصله با kid جدید صادر شود — صدور با کلید خصوصی تازه.
 */
export function rotateSigningKeys(): KeyRotationResult {
  const dir = keysDir();
  const pubPath = join(dir, 'license_public.pem');
  const privPath = join(dir, 'license_private.pem');

  if (!existsSync(privPath) || !existsSync(pubPath)) {
    throw new KeyRotationError(
      'برای چرخش، جفت‌کلید فعلی باید روی دیسک موجود باشد: keys/license_private.pem و keys/license_public.pem (اگر کلید با ENV تحویل شده، چرخش سمت سرور میسر نیست — چرخش را در سرورِ مالکِ کلید با make-license-code.mjs انجام دهید).',
      409
    );
  }

  const oldPub = readFileSync(pubPath, 'utf8');
  const oldPriv = readFileSync(privPath, 'utf8');
  const oldKid = publicKid(oldPub);

  // ۱) بایگانی عمومی قدیمی (پذیرفته‌شده) و خصوصی قدیمی (بایگانی محلی)
  const acceptedDir = join(dir, 'accepted_license_public_keys');
  mkdirSync(acceptedDir, { recursive: true });
  const archivedPub = join(acceptedDir, `license_public_${oldKid}.pem`);
  const archivedPriv = join(dir, `license_private_${oldKid}.pem`);

  // ۲) جفت‌کلید جدید
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const newKid = publicKid(String(publicKey));

  // ۳) نوشتن — به ترتیب اهمیت: اول بایگانی عمودی قدیمی، بعد کلیدهای جدید
  renameSync(pubPath, archivedPub);
  writeFileSync(archivedPriv, oldPriv);
  writeFileSync(pubPath, String(publicKey));
  writeFileSync(privPath, String(privateKey));

  // ۴) رجیستری چرخش
  const registry = join(dir, 'rotations.jsonl');
  const rotatedAt = new Date().toISOString();
  try {
    appendFileSync(registry, JSON.stringify({ rotated_at: rotatedAt, old_kid: oldKid, new_kid: newKid, archived_pub: archivedPub, by: 'admin-panel' }) + '\n', 'utf8');
  } catch (e) {
    console.error('⚠ ثبت رجیستری چرخش ناموفق:', (e as Error).message);
  }

  // ۵) نوسازی حافظه‌ی تأیید چندکلیدی (بدون ری‌استارت) — کدهای قبلی معتبر می‌مانند
  const info = reloadAcceptedKeys();

  return {
    ok: true,
    old_kid: oldKid,
    new_kid: newKid,
    accepted_kids: info.accepted_kids,
    current_kid: info.current_kid,
    archived_pub_path: archivedPub,
    registry_path: registry,
    rotated_at: rotatedAt,
  };
}
