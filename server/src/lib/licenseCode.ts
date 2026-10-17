// ============================================================
// اعتبارسنجی کد لایسنس (JWT امضاشده با RS256) + چرخش کلید امضا (۱.۲۹)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// کد لایسنس، JWT کوتاهی است که با کلید خصوصی RSA طراح امضا می‌شود
// (scripts/make-license-code.mjs). سرور با کلید(های) عمومی داخلی (بدون
// هیچ تماس شبکه) امضا را تأیید می‌کند و طرح/دارنده/پایان اعتبار را
// می‌خواند. کلید خصوصی هرگز داخل image/ریپو نیست.
//
// چرخش کلید (۱.۲۹):
//   هدر JWT میدان «kid» دارد (شناسه‌ی fingerprint کلید امضاکننده).
//   سرور همه‌ی کلیدهای عمومی «پذیرفته‌شده» را از این منابع می‌خواند:
//     ۱) کلید جاری: LICENSE_PUBLIC_KEY ENV → keys/license_public.pem →
//        license_public_key.pem کنار کد (داخل image) — بدون kid هم تأیید می‌شود
//        (سازگاری кодهای قدیمی بدون kid)
//     ۲) کلیدهای قبلی: LICENSE_PUBLIC_KEYS ENV (فرمت: kid1:PEM\nkid2:PEM یا
//        فقط PEM های جدا با \n) و فایل‌های keys/license_public_*.pem /
//        keys/accepted_license_public_keys/*.pem (نام فایل بدون پسوند = kid)
//   ترتیب تأیید: کلیدِ kid هدر اگر شناخته شد؛ سپس همه‌ی کلیدهای پذیرفته‌شده
//   (fallback برای کدهای قدیمی بدون kid). بنابراین چرخش، کدهای قبلیِ فعال‌نشده
//   را باطل نمی‌کند؛ فقط صدور جدید با کلید جدید ادامه می‌یابد.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** keys/ ریشه‌ی پروژه — نسبت به همین ماژول (src/lib یا dist/lib → ../../../keys)
 * در dev ممکن است cwd=server/ باشد (npm -w server) پس بدون این fallback،
 * کپیِ قدیمیِ license_public_key.pem کنار کد (آخرین گزینه) انتخاب می‌شود و
 * پس از چرخش کلید، تأیید کدهای نو با کلید بایگانیِ stale می‌شکند. */
const ROOT_KEYS_DIR = join(__dirname, '..', '..', '..', 'keys');

/** kid = fingerprint ثابت کلید عمومی (۸ کاراکتر hex از SHA-256) */
export function publicKid(pem: string): string {
  return createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);
}

/**
 * کلیدهای عمومی پذیرفته‌شده — نقشه‌ی kid → PEM
 * کلید جاری همیشه هست؛ کلیدهای قبلی از ENV/فایل‌ها اضافه می‌شوند.
 */
function loadAcceptedKeys(): Map<string, string> {
  const map = new Map<string, string>();

  // ۱) کلید جاری (همان منابع قبلی)
  const current = loadCurrentPublicKey();

  // ۲) کلیدهای قبلی از ENV — فرمت: kid:PEM با \n جداکننده یا فقط PEM با \n
  const envKeys = process.env.LICENSE_PUBLIC_KEYS?.trim();
  if (envKeys) {
    for (const entry of envKeys.split(/(?=-----BEGIN PUBLIC KEY-----)/)) {
      const pem = entry.replace(/\\n/g, '\n').trim();
      if (!pem.includes('BEGIN PUBLIC KEY')) continue;
      const kidMatch = pem.match(/^[0-9a-f]{8}:/);
      const kid = kidMatch ? kidMatch[0].slice(0, 8) : publicKid(pem);
      map.set(kid, kidMatch ? pem.slice(9) : pem);
    }
  }

  // ۳) کلیدهای قبلی از فایل‌ها — keys/license_public_*.pem و keys/accepted_license_public_keys/*.pem
  // LICENSE_KEYS_DIR (تست/نصب سفارشی) اولویت دارد؛ در نبودش CWD
  const keysBase = process.env.LICENSE_KEYS_DIR?.trim() || join(process.cwd(), 'keys');
  const dirs = [
    ...new Set([
      keysBase,
      join(keysBase, 'accepted_license_public_keys'),
      // ریشه‌ی پروژه — کلیدهای بایگانی‌شده در dev با cwd غیر از ریشه (نگاه کن به ROOT_KEYS_DIR)
      ROOT_KEYS_DIR,
      join(ROOT_KEYS_DIR, 'accepted_license_public_keys'),
    ]),
  ];
  for (const dir of dirs) {
    try {
      if (!readdirSync(dir).length) continue;
      for (const f of readdirSync(dir)) {
        if (!f.startsWith('license_public') || !f.endsWith('.pem')) continue;
        if (f === 'license_public.pem') continue; // جاری است
        const pem = readFileSync(join(dir, f), 'utf8');
        if (!pem.includes('BEGIN PUBLIC KEY')) continue;
        // نام فایل license_public_XXXX.pem → kid = XXXX؛ در نبود الگو، از fingerprint
        const fileKid = /license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1] ?? publicKid(pem);
        map.set(fileKid, pem);
      }
    } catch { /* پوشه‌ی keys نیست — فقط ENV و جاری */ }
  }

  // جاری آخر — در صورت تکرار، kidِ داخل فایل را با جاری جایگزین می‌کند (جاری اولویت دارد)
  map.set(publicKid(current), current);
  return map;
}

/** کلید عمومی جاری: ENV → keys/license_public.pem → فایل کنار کد (داخل image) */
function loadCurrentPublicKey(): string {
  const env = process.env.LICENSE_PUBLIC_KEY;
  if (env) {
    const trimmed = env.replace(/\\n/g, '\n').trim();
    if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;
  }
  const candidates = [
    join(process.env.LICENSE_KEYS_DIR?.trim() || join(process.cwd(), 'keys'), 'license_public.pem'),
    join(process.cwd(), 'keys', 'license_public.pem'),
    join(ROOT_KEYS_DIR, 'license_public.pem'), // ریشه‌ی پروژه — dev با cwd=server/
    join(__dirname, 'license_public_key.pem'),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, 'utf8'); } catch { /* بعدی */ }
  }
  throw new Error('کلید عمومی لایسنس یافت نشد (LICENSE_PUBLIC_KEY یا license_public_key.pem).');
}

let ACCEPTED_KEYS = loadAcceptedKeys();
let CURRENT_PEM = loadCurrentPublicKey();
let CURRENT_KID = publicKid(CURRENT_PEM);

/**
 * نوسازی حافظه‌ی کلیدها — پس از چرخش درون‌سروری (keyRotation.ts) صدا زده می‌شود؛
 * بدون ری‌استارت سرور، تأیید با کلید جدید فعال و کلید قبلی پذیرفته‌شده می‌ماند.
 * خروجی: اطلاعات جدید برای پاسخ اندپوینت.
 */
export function reloadAcceptedKeys(): { current_kid: string; accepted_kids: string[] } {
  ACCEPTED_KEYS = loadAcceptedKeys();
  CURRENT_PEM = loadCurrentPublicKey();
  CURRENT_KID = publicKid(CURRENT_PEM);
  return acceptedKeysInfo();
}

/** خروجی تشخیصی برای ابزارها/تست — kid جاری و تعداد کلیدهای پذیرفته‌شده */
export function acceptedKeysInfo(): { current_kid: string; accepted_kids: string[] } {
  return { current_kid: CURRENT_KID, accepted_kids: [...ACCEPTED_KEYS.keys()] };
}

/** plan داخل کد لایسنس — هم‌خوان با LicensePlan و PLAN_MONTHS در routes/license.ts */
export type LicenseCodePlan = 'month' | 'quarter' | 'half-year' | 'year' | 'lifetime';

export interface LicenseCodePayload {
  /** شناسه‌ی یکتای کد (jti) — هر کد فقط یک‌بار قابل استفاده است */
  jti: string;
  /** طرح لایسنس */
  plan: LicenseCodePlan;
  /** نام دارنده (سازمان/شخص) — در UI نمایش داده می‌شود */
  to?: string;
  /** ایمیل ثبت‌شده‌ی دارنده */
  email?: string;
  /** یادداشت/شماره فاکتور */
  note?: string;
  /** زمان صدور (Unix) — برای ترتیب فعال‌سازی‌ها */
  iat?: number;
  /** انقضای خودِ کد برای ورود (Unix) */
  exp?: number;
  /** شناسه‌ی کلید امضاکننده (kid) — پس از ۱.۲۹ در صدور جدید ثبت می‌شود */
  kid?: string;
}

export interface VerifiedLicenseCode {
  payload: LicenseCodePayload;
  /** kid کلید امضاکننده‌ی کد (از هدر؛ اگر نبود fingerprint امضای بررسی‌شده) */
  kid?: string;
}

/**
 * تأیید امضای کد لایسنس — خطاها با پیام فارسی مشخص (کد نامعتبر/منقضی/نادرست).
 * کد گروه‌بندی‌شده‌ی خروجی make-license-code --grouped (جداکننده‌ی «+» در هر بخش)
 * هم پذیرفته می‌شود: اول کد اصلی امتحان می‌شود؛ اگر امضا تأیید نشد، نسخه‌ی
 * بدون جداکننده. «+» بیرون از الفبای base64url است و حذفش بی‌خطر است.
 *
 * تأیید با چند کلید: اول کلیدِ kid هدر (اگر شناخته)، سپس کلید جاری، بعد
 * بقیه‌ی کلیدهای پذیرفته‌شده (کدهای صادرشده با کلید قبلی تا پایان exp معتبرند).
 */
export function verifyLicenseCode(codeRaw: string): VerifiedLicenseCode {
  const code = codeRaw.trim().replace(/\s+/g, '');
  const candidates = new Set<string>([code]);
  if (code.includes('+')) {
    candidates.add(code.split('.').map((seg) => seg.replace(/\+/g, '')).join('.'));
  }
  if (code.includes('-')) {
    // حالت قدیمی گروه‌بندی با خط‌تیره — وقتی توکن خودش «-» نداشته باشد کار می‌کند
    candidates.add(code.split('.').map((seg) => seg.replace(/-/g, '')).join('.'));
  }
  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      return verifyOnce(candidate);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('کد لایسنس نامعتبر است.');
}

/** decode هدر به‌سبک خودمان (بدون تأیید امضا — فقط برای خواندن kid) */
function readKidUnsafe(token: string): string | undefined {
  try {
    const h = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    return typeof h?.kid === 'string' && /^[0-9a-f]{8}$/.test(h.kid) ? h.kid : undefined;
  } catch { return undefined; }
}

function verifyOnce(code: string): VerifiedLicenseCode {
  const headerKid = readKidUnsafe(code);

  /** امتحان یک کلید؛ خطای امضا/فارسی را می‌سازد */
  const attempt = (pem: string, kid: string): { payload: LicenseCodePayload; kid: string } => {
    let payload: LicenseCodePayload;
    try {
      payload = jwt.verify(code, pem, { algorithms: ['RS256'] }) as LicenseCodePayload;
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'TokenExpiredError') {
        throw Object.assign(new Error('کد لایسنس منقضی شده است — کد جدید درخواست کنید.'), { code: 'LICENSE_CODE_EXPIRED' });
      }
      throw new Error('__SIG_FAIL__'); // سیگنال داخلی: امضا با این کلید نشد
    }
    return { payload, kid };
  };

  let lastSigFail: unknown = null;

  // ۱) کلیدِ kid هدر — اگر شناخته‌ایم
  if (headerKid && ACCEPTED_KEYS.has(headerKid)) {
    try {
      const r = attempt(ACCEPTED_KEYS.get(headerKid)!, headerKid);
      return check(r.payload, r.kid);
    } catch (e) {
      if ((e as { code?: string }).code === 'LICENSE_CODE_EXPIRED') throw e;
      lastSigFail = e;
    }
  }

  // ۲) کلید جاری (کدهای بدون kid یا با kid ناشناخته)
  try {
    const r = attempt(CURRENT_PEM, CURRENT_KID);
    return check(r.payload, r.kid);
  } catch (e) {
    if ((e as { code?: string }).code === 'LICENSE_CODE_EXPIRED') throw e;
    lastSigFail = e;
  }

  // ۳) بقیه‌ی کلیدهای پذیرفته‌شده (کدهای قدیمی قبل از چرخش)
  for (const [kid, pem] of ACCEPTED_KEYS) {
    if (kid === CURRENT_KID || kid === headerKid) continue;
    try {
      const r = attempt(pem, kid);
      return check(r.payload, r.kid);
    } catch (e) {
      if ((e as { code?: string }).code === 'LICENSE_CODE_EXPIRED') throw e;
      lastSigFail = e;
    }
  }

  throw lastSigFail ?? new Error('کد لایسنس نامعتبر است.');
}

/** چک payload مشترک بعد از تأیید امضا */
function check(payload: LicenseCodePayload, kid: string): VerifiedLicenseCode {
  if (!payload || typeof payload.jti !== 'string' || !payload.jti) {
    throw Object.assign(new Error('کد لایسنس فاقد شناسه‌ی یکتاست.'), { code: 'LICENSE_CODE_INVALID' });
  }
  const validPlans: LicenseCodePlan[] = ['month', 'quarter', 'half-year', 'year', 'lifetime'];
  if (!validPlans.includes(payload.plan)) {
    throw Object.assign(new Error('طرح داخل کد لایسنس نامعتبر است.'), { code: 'LICENSE_CODE_INVALID' });
  }
  return { payload, kid };
}

/** خواندن ساده‌ی payload بدون تأیید امضا — فقط برای پیش‌نمایش UI (مثلاً شناسه‌ی کد) */
export function decodeLicenseCodeUnsafe(code: string): LicenseCodePayload | null {
  try {
    const d = jwt.decode(code);
    return (d && typeof d === 'object' ? d : null) as LicenseCodePayload | null;
  } catch {
    return null;
  }
}
