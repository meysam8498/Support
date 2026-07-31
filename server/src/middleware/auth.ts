import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../lib/auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

/** استخراج و اعتبارسنجی توکن از هدر Authorization */
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
  req.user = payload;
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
