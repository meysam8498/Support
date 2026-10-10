// ============================================================
// احراز هویت: هش رمز + صدور/اعتبارسنجی توکن JWT
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌های پنج‌گانه:
//   admin     — مدیر همه‌چیز + مدیریت کاربران + بکاپ/بازیابی
//   warehouse — انباردار: ورود/ویرایش/حذف سریال‌ها، تجهیزات و کاتالوگ (بدون مدیریت کاربران/بکاپ)
//   sales     — کارشناس فروش: مشاهده همه‌چیز + ثبت درخواست گارانتی (بدون افزودن/حذف قطعه و سریال)
//   tech      — کارشناس فنی: مشاهده + ویرایش/افزودن همه‌چیز شامل تعویض گارانتی (بدون مدیریت کاربران/بکاپ/حذف تجهیز)
//   viewer    — فقط گزارش‌ها و مشاهده/جست‌وجو (بدون هیچ ویرایش)
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// لایسنس تجاری: استفاده، کپی و توزیع تابع فایل LICENSE در ریشه‌ی مخزن است.
// Licensor: Meysam Ijadi — M.Ijadi@Hotmail.com — +98 902 296 4006

export type Role = 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer';
export const ROLES: Role[] = ['admin', 'warehouse', 'sales', 'tech', 'viewer'];

/** نقش‌های مجاز برای ویرایش/نوشتن عمومی (همه به‌جز فروش و فقط‌مشاهده) */
export const WRITE_ROLES: Role[] = ['admin', 'warehouse', 'tech'];

// ─────────────────────────────────────────────────────────────
// JWT secret ایمن (۱.۲۸.۰):
//   ۱) JWT_SECRET از ENV — ترجیحی؛ طول ≥ ۳۲ چک می‌شود.
//   ۲) نبودِ ENV → ساخت تصادفی ۶۴ کاراکتری هگز در data/jwt-secret.txt
//      (کنار دیتابیس؛ روی volume می‌ماند تا ری‌استارت همه‌ی توکن‌ها را باطل نکند)
//      + هشدار در لاگ تا ادمین ENV را تنظیم کند.
//   ۳) LICENSE_ENFORCE=1 (نصب تجاری) بدون ENV قوی اصلاً بالا نمی‌آید —
//      توکن جعل‌پذیر در نصبِ مشتری پولی یعنی دور زدن کامل احراز هویت.
// ─────────────────────────────────────────────────────────────
function loadJwtSecret(): { secret: string; regenerated: boolean } {
  const fromEnv = process.env.JWT_SECRET?.trim() || '';
  if (fromEnv) {
    if (process.env.LICENSE_ENFORCE === '1' && fromEnv.length < 32) {
      throw new Error('LICENSE_ENFORCE=1: JWT_SECRET باید حداقل ۳۲ کاراکتر باشد (بدون ENV قوی، سرور بالا نمی‌آید).');
    }
    if (process.env.NODE_ENV === 'production' && fromEnv.length < 32) {
      console.warn('⚠ JWT_SECRET کوتاه است (< ۳۲) — برای production مقدار طولانی‌تری بگذارید.');
    }
    return { secret: fromEnv, regenerated: false };
  }

  // نبودِ ENV — secret تصادفی ماندگار کنار دیتابیس
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), 'data');
  const secretFile = path.join(dataDir, 'jwt-secret.txt');
  try {
    if (existsSync(secretFile)) {
      const saved = readFileSync(secretFile, 'utf8').trim();
      if (saved.length >= 32) {
        console.warn('⚠ JWT_SECRET در ENV تنظیم نشده — از secret تصادفی ذخیره‌شده استفاده می‌شود. تولید/بازیابی توکن‌های قدیمی از ENV جدا است.');
        return { secret: saved, regenerated: false };
      }
    }
    // ساختن ذخیره‌شده‌ی معتبر نیست — یا فایل نیست یا کوتاه است
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      if (!existsSync(dataDir)) { mkdirSync(dataDir, { recursive: true }); }
      writeFileSync(secretFile, generated + '\n', 'utf8');
      console.warn('⚠ JWT_SECRET تنظیم نشده بود — secret تصادفی جدید ساخته و در data/jwt-secret.txt ذخیره شد. برای پایداری توکن‌ها بین اجراها JWT_SECRET را در ENV تنظیم کنید.');
    } catch {
      console.warn('⚠ JWT_SECRET تنظیم نشده و نوشتن فایل ناموفق — secret تصادفی موقتِ این اجرا استفاده می‌شود (توکن‌ها بعد از ری‌استارت نامعتبر می‌شوند).');
    }
    return { secret: generated, regenerated: true };
  } catch (err) {
    // هر خطای غیرمنتظره — secret موقت (بهتر از قفل‌شدن سرور dev)
    console.warn('⚠ fallback: secret تصادفی موقت (خطا در خواندن ذخیره‌شده):', (err as Error).message);
    return { secret: crypto.randomBytes(32).toString('hex'), regenerated: true };
  }
}

/** تنظیم jwt secret — یک بار در startup */
export function initJwtSecret(): void {
  const { regenerated } = loadJwtSecret(); // علاوه براین، سازنده‌ی ماژول نیز اجرا شده
  if (regenerated) {
    console.warn('⚠ با secret تصادفی، توکن‌های نشست‌های قبلی نامعتبر می‌شوند — کاربران دوباره وارد شوند.');
  }
}

const __secret = loadJwtSecret();
const JWT_SECRET = __secret.secret;
const JWT_EXPIRES_HOURS = Number(process.env.JWT_EXPIRES_HOURS || 12);

/** هش رمز عبور */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

/** بررسی رمز عبور */
export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export interface JwtPayload {
  sub: number;       // user id
  username: string;
  role: Role;
  fullName: string;
}

/** صدور توکن احراز هویت */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${JWT_EXPIRES_HOURS}h`,
  } as jwt.SignOptions);
}

/** اعتبارسنجی و رمزگشایی توکن */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
  } catch {
    return null;
  }
}
