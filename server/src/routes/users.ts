// ============================================================
// مدیریت کاربران — مسیرهای API (فقط مدیر)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// CRUD کامل کاربران: ساخت، ویرایش، حذف، فعال/غیرفعال، بازنشانی رمز.
// تمام مسیرها (GET و نوشتن) فقط برای نقش 'admin' مجاز است.
// ============================================================
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { hashPassword, ROLES } from '../lib/auth.js';
import { requireRole } from '../middleware/auth.js';
import { usernameSchema, passwordSchema, firstZodMessage } from '../lib/validation.js';

const router = Router();

// کل این روتر فقط برای مدیر است — ادمین یوزر کم و زیاد می‌کند و نقش می‌دهد.
router.use(requireRole('admin'));

const roleEnum = z.enum(ROLES as [string, ...string[]]);

// حداقل طول نام کاربری/رمز از قوانین مشترک می‌آید — همگام با گیت UX کلاینت (lib/validation.ts)
const createSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  full_name: z.string().min(1),
  email: z.string().optional().nullable(),
  role: roleEnum.default('viewer'),
  active: z.number().int().min(0).max(1).optional(),
});

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().optional().nullable(),
  role: roleEnum.optional(),
  active: z.number().int().min(0).max(1).optional(),
});

const resetPasswordSchema = z.object({ password: passwordSchema });

/** GET /api/users — فهرست همه‌ی کاربران (بدون هش رمز) */
router.get('/', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT id, username, full_name, email, role, active, created_at
    FROM users ORDER BY created_at ASC
  `).all();
  res.json(rows);
});

/** POST /api/users — ساخت کاربر جدید */
router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    // پیام فارسی مشخص (مثلاً «نام کاربری حداقل ۲ نویسه است.») — همان متن گیت کلاینت
    return res.status(400).json({ error: firstZodMessage(parsed.error), detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(b.username.trim(), hashPassword(b.password), b.full_name.trim(), b.email || null, b.role, b.active ?? 1);
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده است.' });
  }
});

/** PUT /api/users/:id — ویرایش کاربر (بدون تغییر رمز) */
router.put('/:id', (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  }
  const b = parsed.data;
  const id = Number(req.params.id);
  const db = getDb();

  // جلوگیری از غیرفعال یا تغییر نقش آخرین مدیر
  const target = db.prepare(`SELECT role, active FROM users WHERE id = ?`).get(id) as
    | { role: string; active: number } | undefined;
  if (!target) return res.status(404).json({ error: 'کاربر یافت نشد.' });

  const willDemote = b.role !== undefined && b.role !== 'admin' && target.role === 'admin';
  const willDisable = b.active !== undefined && b.active === 0 && target.active === 1 && target.role === 'admin';
  if (willDemote || willDisable) {
    const adminCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND active = 1`).get() as { c: number };
    if (adminCount.c <= 1) {
      return res.status(400).json({ error: 'نمی‌توان تنها مدیر فعال را غیرفعال یا تنزل داد.' });
    }
  }

  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      email     = COALESCE(?, email),
      role      = COALESCE(?, role),
      active    = COALESCE(?, active)
    WHERE id = ?
  `).run(b.full_name ?? null, b.email ?? null, b.role ?? null, b.active ?? null, id);
  res.json({ ok: true });
});

/** POST /api/users/:id/reset-password — بازنشانی رمز عبور */
router.post('/:id/reset-password', (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: firstZodMessage(parsed.error), detail: parsed.error.flatten() });
  }
  const id = Number(req.params.id);
  const exists = getDb().prepare(`SELECT id FROM users WHERE id = ?`).get(id);
  if (!exists) return res.status(404).json({ error: 'کاربر یافت نشد.' });
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(parsed.data.password), id);
  res.json({ ok: true });
});

/** DELETE /api/users/:id — حذف کاربر */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const target = db.prepare(`SELECT role FROM users WHERE id = ?`).get(id) as { role: string } | undefined;
  if (!target) return res.status(404).json({ error: 'کاربر یافت نشد.' });
  if (target.role === 'admin') {
    const adminCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'admin'`).get() as { c: number };
    if (adminCount.c <= 1) {
      return res.status(400).json({ error: 'نمی‌توان تنها مدیر را حذف کرد.' });
    }
  }
  // جلوگیری از حذف خود کاربرِ جاری
  if (req.user!.sub === id) {
    return res.status(400).json({ error: 'نمی‌توانید حساب خودتان را حذف کنید.' });
  }
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
