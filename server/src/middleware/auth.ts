import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import { getDb } from '../db/db.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

type UserState = {
  token_version: number;
  must_change_password: number;
  active: number;
  role: JwtPayload['role'];
  username: string;
  full_name: string;
};

/**
 * مسیرهایی که کاربرِ «مجبور به تغییر رمز» هم می‌تواند صدا بزند.
 * بدون این استثناها، کاربر با رمز پیش‌فرض قفل می‌شد و راهی برای عوض‌کردنش نداشت.
 */
const PASSWORD_CHANGE_ALLOWED = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout-all'];

/** وضعیت جاری کاربر در DB — منبع حقیقت برای ابطال نشست و نقش */
function readUserState(id: number): UserState | undefined {
  return getDb()
    .prepare(`SELECT token_version, must_change_password, active, role, username, full_name FROM users WHERE id = ?`)
    .get(id) as UserState | undefined;
}

/**
 * استخراج و اعتبارسنجی توکن از هدر Authorization.
 * علاوه بر امضا، وضعیت کاربر هم چک می‌شود:
 *   • کاربر حذف/غیرفعال شده → ۴۰۱ (توکن تا انقضا زنده نمی‌ماند)
 *   • token_version توکن با DB نمی‌خواند → ۴۰۱ (رمز/نقش عوض شده)
 *   • نقش از DB خوانده می‌شود، نه از توکن (تغییر نقش فوراً اثر می‌کند)
 *   • must_change_password → ۴۲۸ برای همه‌ی مسیرها جز تغییر رمز/پروفایل
 */
export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'احراز هویت لازم است.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'توکن نامعتبر یا منقضی است.' });
    return;
  }

  const state = readUserState(payload.sub);
  if (!state || state.active !== 1) {
    res.status(401).json({ error: 'حساب کاربری غیرفعال یا حذف شده است.' });
    return;
  }
  if ((payload.tv ?? 0) !== state.token_version) {
    res.status(401).json({ error: 'نشست شما باطل شده است؛ دوباره وارد شوید.' });
    return;
  }

  // نقش و نام از DB — توکن فقط هویت را ثابت می‌کند
  req.user = { ...payload, role: state.role, username: state.username, fullName: state.full_name };

  if (state.must_change_password === 1) {
    const path = req.originalUrl.split('?')[0];
    if (!PASSWORD_CHANGE_ALLOWED.includes(path)) {
      res.status(428).json({
        error: 'پیش از ادامه، رمز عبور خود را تغییر دهید.',
        must_change_password: true,
      });
      return;
    }
  }

  next();
}

/** سازنده‌ی middleware محدود کردن دسترسی به نقش‌های مشخص */
export function requireRole(...roles: JwtPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'احراز هویت لازم است.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'دسترسی برای نقش شما مجاز نیست.' });
      return;
    }
    next();
  };
}

/** میان‌افزار مدیریت متمرکز خطاها */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[خطا]', err.message);
  res.status(500).json({ error: 'خطای داخلی سرور رخ داد.', detail: err.message });
}
