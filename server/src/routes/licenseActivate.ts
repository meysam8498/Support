// ============================================================
// فعال‌سازی با کد لایسنس (JWT امضاشده RS256)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
//   POST /api/license/activate             — ورود کد لایسنس (فقط ادمین)
//   GET  /api/license/code-status?code=... — پیش‌نمایش بدون ثبت (فقط ادمین)
// ----------------------------------------------------------------
// کد لایسنس، JWT کوتاهی است که طراح با کلید خصوصی RSA امضا می‌کند
// (scripts/make-license-code.mjs). سرور فقط با کلید عمومی داخل خودش
// (بدون هیچ تماس شبکه) امضا را تأیید و طرح/دارنده/پایان را اعمال
// می‌کند. هر کد (jti) فقط یک‌بار قابل استفاده است؛ سوابق در جدول
// license_activations نگهداری می‌شود.
// ============================================================
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';
import { verifyLicenseCode, type LicenseCodePlan } from '../lib/licenseCode.js';
import { todayJalali, jalaliToGregorianISO, addMonthsToJalali, gregorianToJalali } from '../lib/date.js';
import { licenseStatus, PLAN_MONTHS, deviceLimitInfo, getRevokedJtis } from './license.js';

const router = Router();

/** جدول سوابق فعال‌سازی — idempotent (برای DBهای قدیمی که schema.sql را ندیده‌اند) */
function ensureActivationsTable(db: ReturnType<typeof getDb>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS license_activations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      jti            TEXT NOT NULL UNIQUE,
      plan           TEXT NOT NULL,
      licensed_to    TEXT,
      email          TEXT,
      note           TEXT,
      code_iat       INTEGER,
      activated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      activated_by   INTEGER,
      FOREIGN KEY (activated_by) REFERENCES users(id)
    );
  `);
}

const activateSchema = z.object({ code: z.string().min(20).max(4000) });
const previewSchema = z.object({ code: z.string().min(20).max(4000) });

router.post('/activate', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'کد لایسنس را وارد کنید.' });
  const code = parsed.data.code.trim();

  // ۱) تأیید امضا با کلید عمومی داخلی (بدون شبکه)
  let plan: LicenseCodePlan;
  let jti: string;
  let licensedTo: string | null;
  let email: string | null;
  let note: string | null;
  let codeIat: number | null;
  try {
    const v = verifyLicenseCode(code);
    plan = v.payload.plan;
    jti = v.payload.jti;
    licensedTo = v.payload.to?.trim() || null;
    email = v.payload.email?.trim() || null;
    note = v.payload.note?.trim() || null;
    codeIat = typeof v.payload.iat === 'number' ? v.payload.iat : null;
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message, invalid_code: true });
  }

  // ۲) ضد استفاده مجدد — هر jti فقط یک‌بار
  const db = getDb();
  try { ensureActivationsTable(db); } catch (err) {
    return res.status(500).json({ error: 'خطای داخلی (جدول فعال‌سازی‌ها).', detail: (err as Error).message });
  }
  const dup = db.prepare(`SELECT id, activated_at FROM license_activations WHERE jti = ?`).get(jti) as
    | { id: number; activated_at: string | null }
    | undefined;
  if (dup) {
    const alsoRevoked = getRevokedJtis(db).includes(jti);
    return res.status(409).json({
      error: alsoRevoked
        ? 'این کد قبلاً استفاده شده و سپس باطل شده است (استرداد/سرقت).'
        : 'این کد لایسنس قبلاً استفاده شده است.',
      activated_at: dup.activated_at,
      already_used: true,
      ...(alsoRevoked ? { revoked: true } : {}),
    });
  }

  // ۲+۱) ضد ابطال — کدهای باطل‌شده (استرداد/سرقت) فعال نمی‌شوند
  if (getRevokedJtis(db).includes(jti)) {
    return res.status(403).json({
      error: 'این کد لایسنس باطل شده است (استرداد/سرقت/اشتباه در صدور) — با فروشنده تماس بگیرید.',
      revoked: true,
      jti,
    });
  }

  // ۳) اعمال روی license_info — شروع: امروز؛ پایان: از طول طرح (lifetime بدون پایان)
  const startsJ = todayJalali();
  const startsG = jalaliToGregorianISO(startsJ);
  if (!startsG) return res.status(500).json({ error: 'محاسبه‌ی تاریخ شروع ناموفق بود.' });
  let expiresG: string | null = null;
  const pm = PLAN_MONTHS[plan];
  if (pm !== null) {
    const autoJ = addMonthsToJalali(startsJ, pm);
    expiresG = autoJ ? jalaliToGregorianISO(autoJ) : null;
  }

  try {
    db.exec('BEGIN');
    db.prepare(
      `INSERT INTO license_activations (jti, plan, licensed_to, email, note, code_iat, activated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(jti, plan, licensedTo, email, note, codeIat, (req as unknown as { user?: { id?: number } }).user?.id ?? null);
    db.prepare(
      `UPDATE license_info SET plan = ?, starts_at = ?, expires_at = ?, licensed_to = ?, notes = ?, updated_at = datetime('now') WHERE id = 1`
    ).run(plan, startsG, expiresG, licensedTo, note);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* */ }
    return res.status(500).json({ error: 'ثبت فعال‌سازی ناموفق بود.', detail: (err as Error).message });
  }

  const status = licenseStatus();
  return res.status(201).json({
    ok: true,
    activated: true,
    plan,
    plan_label: status.plan_label,
    licensed_to: licensedTo,
    starts_at: startsG,
    expires_at: expiresG,
    days_left: status.days_left,
    device_limit: deviceLimitInfo(),
  });
});

/** GET /api/license/activations — سوابق فعال‌سازی (فقط ادمین) */
router.get('/activations', requireRole('admin'), (_req: Request, res: Response) => {
  const db = getDb();
  try { ensureActivationsTable(db); } catch { /* */ }
  const rows = db.prepare(`SELECT id, jti, plan, licensed_to, email, note, code_iat, activated_at FROM license_activations ORDER BY id DESC LIMIT 100`).all() as Array<Record<string, unknown>>;
  const revoked = new Set(getRevokedJtis(db));
  res.json(rows.map((r) => ({ ...r, revoked: revoked.has(String(r.jti)) })));
});

router.post('/code-status', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = previewSchema.safeParse({ code: String((req.body as { code?: unknown })?.code ?? '') });
  if (!parsed.success) return res.status(400).json({ error: 'کد لایسنس را وارد کنید.' });
  const code = parsed.data.code.trim();
  try {
    const v = verifyLicenseCode(code);
    return res.json({
      valid: true,
      jti: v.payload.jti,
      plan: v.payload.plan,
      to: v.payload.to ?? null,
      email: v.payload.email ?? null,
      note: v.payload.note ?? null,
      issued_at: v.payload.iat ?? null,
      expires_in_days:
        v.payload.exp && v.payload.iat
          ? Math.max(0, Math.round((v.payload.exp - v.payload.iat) / 86400))
          : null,
    });
  } catch (e) {
    return res.status(400).json({ valid: false, error: (e as Error).message, invalid_code: true });
  }
});

export default router;
