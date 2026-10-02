import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { verifyPassword, signToken } from '../lib/auth.js';

const router = Router();

// لاگین عمداً فقط min(1) — حداقل طول واقعی (۲/۴) روی «ساخت/تغییر» اعتبارنامه
// اعمال می‌شود (lib/validation.ts) تا حساب‌های قدیمی با رمز کوتاه قفل نشوند.
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/** POST /api/auth/login — ورود کاربر و دریافت توکن */
router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.' });
  }
  const { username, password } = parsed.data;

  const db = getDb();
  const user = db.prepare(
    `SELECT id, username, password_hash, full_name, role, active FROM users WHERE username = ?`
  ).get(username) as
    | { id: number; username: string; password_hash: string; full_name: string; role: 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer'; active: number }
    | undefined;

  // پیام یکسان برای «کاربر وجود ندارد»، «رمز نادرست» و «حساب غیرفعال»
  // تا مهاجم نتواند وجود نام کاربری را حدس بزند.
  if (!user || !verifyPassword(password, user.password_hash) || user.active !== 1) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است (یا حساب غیرفعال است).' });
  }

  const token = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

export default router;
