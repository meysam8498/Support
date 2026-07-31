// ============================================================
// احراز هویت: هش رمز + صدور/اعتبارسنجی توکن JWT
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها فقط 'admin' (دسترسی کامل) و 'user' (فقط مشاهده/جستجو) هستند.
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
  role: 'admin' | 'user';
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
