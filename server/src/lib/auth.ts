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

export type Role = 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer';
export const ROLES: Role[] = ['admin', 'warehouse', 'sales', 'tech', 'viewer'];

/** نقش‌های مجاز برای ویرایش/نوشتن عمومی (همه به‌جز فروش و فقط‌مشاهده) */
export const WRITE_ROLES: Role[] = ['admin', 'warehouse', 'tech'];

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
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
