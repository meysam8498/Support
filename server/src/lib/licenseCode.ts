// ============================================================
// اعتبارسنجی کد لایسنس (JWT امضاشده با RS256)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// کد لایسنس، JWT کوتاهی است که با کلید خصوصی RSA طراح امضا می‌شود
// (scripts/make-license-code.mjs). سرور با کلید عمومی داخلی (بدون
// هیچ تماس شبکه) امضا را تأیید می‌کند و طرح/دارنده/پایان اعتبار را
// می‌خواند. کلید خصوصی هرگز داخل image/ریپو نیست.
// ============================================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** کلید عمومی: ENV → keys/license_public.pem → فایل کنار کد (داخل image) */
function loadPublicKey(): string {
  const env = process.env.LICENSE_PUBLIC_KEY;
  if (env) {
    const trimmed = env.replace(/\\n/g, '\n').trim();
    if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;
  }
  const candidates = [
    join(process.cwd(), 'keys', 'license_public.pem'),
    join(__dirname, 'license_public_key.pem'),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, 'utf8'); } catch { /* بعدی */ }
  }
  throw new Error('کلید عمومی لایسنس یافت نشد (LICENSE_PUBLIC_KEY یا license_public_key.pem).');
}

const PUBLIC_KEY = loadPublicKey();

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
  /** انقضای خودکار خود کد (Unix) — پیش‌فرض ۱۸۰ روز پس از صدور؛ جدا از انقضای طرح */
  exp?: number;
}

export interface VerifiedLicenseCode {
  payload: LicenseCodePayload;
}

/**
 * تأیید امضای کد لایسنس — خطاها با پیام فارسی مشخص (کد نامعتبر/منقضی/نادرست).
 * کد گروه‌بندی‌شده (خط‌تیره‌های قالب‌بندی در هر بخش) هم پذیرفته می‌شود:
 * اول کد اصلی امتحان می‌شود؛ اگر امضا تأیید نشد، نسخه‌ی بدون خط‌تیره.
 */
export function verifyLicenseCode(codeRaw: string): VerifiedLicenseCode {
  const code = codeRaw.trim().replace(/\s+/g, '');
  const candidates = new Set<string>([code]);
  if (code.includes('-')) {
    // نسخه‌ی بدون خط‌تیره — خنثی‌سازی قالب گروه‌بندی‌شده‌ی خروجی make-license-code
    const ungrouped = code.split('.').map((seg) => seg.replace(/-/g, '')).join('.');
    candidates.add(ungrouped);
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

function verifyOnce(code: string): VerifiedLicenseCode {
  let payload: LicenseCodePayload;
  try {
    payload = jwt.verify(code, PUBLIC_KEY, { algorithms: ['RS256'] }) as LicenseCodePayload;
  } catch (e) {
    const msg = (e as { name?: string; message?: string }).name === 'TokenExpiredError'
      ? 'کد لایسنس منقضی شده است — کد جدید درخواست کنید.'
      : 'کد لایسنس نامعتبر است (امضا تأیید نشد).';
    throw Object.assign(new Error(msg), { code: 'LICENSE_CODE_INVALID' });
  }
  if (!payload || typeof payload.jti !== 'string' || !payload.jti) {
    throw Object.assign(new Error('کد لایسنس فاقد شناسه‌ی یکتاست.'), { code: 'LICENSE_CODE_INVALID' });
  }
  const validPlans: LicenseCodePlan[] = ['month', 'quarter', 'half-year', 'year', 'lifetime'];
  if (!validPlans.includes(payload.plan)) {
    throw Object.assign(new Error('طرح داخل کد لایسنس نامعتبر است.'), { code: 'LICENSE_CODE_INVALID' });
  }
  return { payload };
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
