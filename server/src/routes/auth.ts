import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { verifyPassword, signToken, hashPassword, type JwtPayload } from '../lib/auth.js';
import { passwordSchema, firstZodMessage } from '../lib/validation.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// لاگین عمداً فقط min(1) — حداقل طول واقعی (۲/۴) روی «ساخت/تغییر» اعتبارنامه
// اعمال می‌شود (lib/validation.ts) تا حساب‌های قدیمی با رمز کوتاه قفل نشوند.
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'رمز فعلی الزامی است.'),
  new_password: passwordSchema,
});

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: JwtPayload['role'];
  active: number;
  token_version: number;
  must_change_password: number;
};

function loadUserByUsername(username: string): UserRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, username, password_hash, full_name, role, active, token_version, must_change_password
       FROM users WHERE username = ?`
    )
    .get(username) as UserRow | undefined;
}

function tokenFor(u: UserRow): string {
  return signToken({
    sub: u.id,
    username: u.username,
    role: u.role,
    fullName: u.full_name,
    tv: u.token_version,
  });
}

function publicUser(u: UserRow) {
  return { id: u.id, username: u.username, fullName: u.full_name, role: u.role };
}

/** POST /api/auth/login — ورود کاربر و دریافت توکن */
router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.' });
  }
  const { username, password } = parsed.data;

  const user = loadUserByUsername(username);

  // پیام یکسان برای «کاربر وجود ندارد»، «رمز نادرست» و «حساب غیرفعال»
  // تا مهاجم نتواند وجود نام کاربری را حدس بزند.
  if (!user || !verifyPassword(password, user.password_hash) || user.active !== 1) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است (یا حساب غیرفعال است).' });
  }

  return res.json({
    token: tokenFor(user),
    user: publicUser(user),
    must_change_password: user.must_change_password === 1,
  });
});

/** GET /api/auth/me — وضعیت جاری نشست (نقش/نام از DB، نه از توکن) */
router.get('/me', authRequired, (req, res) => {
  const row = getDb()
    .prepare(`SELECT id, username, full_name, role, must_change_password FROM users WHERE id = ?`)
    .get(req.user!.sub) as
    | { id: number; username: string; full_name: string; role: JwtPayload['role']; must_change_password: number }
    | undefined;
  if (!row) return res.status(401).json({ error: 'حساب کاربری یافت نشد.' });
  res.json({
    user: { id: row.id, username: row.username, fullName: row.full_name, role: row.role },
    must_change_password: row.must_change_password === 1,
  });
});

/**
 * POST /api/auth/change-password — تغییر رمز توسط خود کاربر
 * پس از تغییر، token_version بالا می‌رود (همه‌ی نشست‌های قبلی باطل) و توکن تازه
 * برمی‌گردد تا همین دستگاه بدون ورود دوباره ادامه دهد.
 */
router.post('/change-password', authRequired, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodMessage(parsed.error), detail: parsed.error.flatten() });
  }
  const { current_password, new_password } = parsed.data;
  const db = getDb();
  const row = db
    .prepare(`SELECT id, username, password_hash, full_name, role, active, token_version, must_change_password FROM users WHERE id = ?`)
    .get(req.user!.sub) as UserRow | undefined;
  if (!row) return res.status(401).json({ error: 'حساب کاربری یافت نشد.' });

  if (!verifyPassword(current_password, row.password_hash)) {
    return res.status(400).json({ error: 'رمز فعلی نادرست است.' });
  }
  if (verifyPassword(new_password, row.password_hash)) {
    return res.status(400).json({ error: 'رمز جدید باید با رمز فعلی متفاوت باشد.' });
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?`
  ).run(hashPassword(new_password), row.id);

  const fresh = loadUserByUsername(row.username)!;
  res.json({ ok: true, token: tokenFor(fresh), user: publicUser(fresh), must_change_password: false });
});

/**
 * POST /api/auth/logout-all — باطل‌کردن همه‌ی نشست‌های این حساب
 * (توکن همین دستگاه هم باطل می‌شود؛ کلاینت توکن محلی را پاک می‌کند.)
 */
router.post('/logout-all', authRequired, (req, res) => {
  getDb().prepare(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`).run(req.user!.sub);
  res.json({ ok: true });
});

export default router;
