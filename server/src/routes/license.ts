// ============================================================
// لایسنس سامانه — وضعیت/بازه‌ی اعتبار (زیرساخت تجاری‌سازی آینده)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
//   GET  /api/license          — وضعیت لایسنس (همه‌ی کاربران احرازشده؛
//                                برای نمایش بج در UI و چک سمت کلاینت)
//   PUT  /api/license          — تنظیم لایسنس (فقط ادمین): طرح، شروع، پایان، دارنده
//   POST /api/license/extend   — تمدید از تاریخ پایان فعلی (ماه‌ها) (فقط ادمین)
// نسخه‌ی فعلی: رایگان/آزمایشی بدون محدودیت (enforce = false در محیط) —
// زیرساخت آماده است؛ فعال‌سازی محدودسازی با LICENSE_ENFORCE=1 در آینده.
// ============================================================
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';
import { todayGregorian, todayJalali, addMonthsToJalali, jalaliToGregorianISO, gregorianToJalali } from '../lib/date.js';
import { verifyLicenseCode } from '../lib/licenseCode.js';
import { SHARED_STRINGS } from '../lib/sharedStrings.js';
import { createSign, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();

export type LicensePlan = 'trial' | 'month' | 'quarter' | 'half-year' | 'year' | 'lifetime';

/** مدت هر طرح به ماه (null = بی‌نهایت) */
export const PLAN_MONTHS: Record<LicensePlan, number | null> = {
  trial: null,
  month: 1,
  quarter: 3,
  'half-year': 6,
  year: 12,
  lifetime: null,
};

export interface LicenseRow {
  id: 1;
  plan: LicensePlan;
  starts_at: string | null;
  expires_at: string | null;
  licensed_to: string | null;
  notes: string | null;
  updated_at: string | null;
  code_jti?: string | null;
  code_fingerprint?: string | null;
  activated_at?: string | null;
  revoked_jtis?: string | null;
  revoked_at?: string | null;
  revoked_by?: number | null;
}

/** خواندن ردیف لایسنس (با ساخت خودکار در صورت نبود) */
export function getLicenseRow(): LicenseRow {
  const db = getDb();
  let row = db.prepare(`SELECT * FROM license_info WHERE id = 1`).get() as unknown as LicenseRow | undefined;
  if (!row) {
    db.prepare(`INSERT OR IGNORE INTO license_info (id, plan, licensed_to, notes) VALUES (1, 'trial', 'ارزیابی', 'نسخه‌ی رایگان')`).run();
    row = db.prepare(`SELECT * FROM license_info WHERE id = 1`).get() as unknown as LicenseRow;
  }
  return row;
}

/** وضعیت محاسبه‌شده‌ی لایسنس — روزهای باقی‌مانده + فعال بودن */
export function licenseStatus() {
  const row = getLicenseRow();
  const enforce = process.env.LICENSE_ENFORCE === '1';
  const today = todayGregorian();
  const daysLeft = row.expires_at
    ? Math.max(0, Math.round((new Date(row.expires_at).getTime() - new Date(today).getTime()) / 86400000))
    : null;
  const expired = row.expires_at ? row.expires_at < today : false;
  // تا وقتی enforce فعال نشده، انقضا فقط هشدار است — سامانه بلاک نمی‌شود
  const valid = !expired || !enforce;
  // چه‌کسی/کِی آخرین ابطال را زده (برای گزارش صفحه‌ی لایسنس)
  let revoked_by_name: string | null = null;
  if (row.revoked_by) {
    try {
      const u = getDb().prepare(`SELECT full_name FROM users WHERE id = ?`).get(row.revoked_by) as { full_name?: string } | undefined;
      revoked_by_name = u?.full_name ?? null;
    } catch { /* */ }
  }
  return {
    ...row,
    enforce,
    days_left: daysLeft,
    expired,
    valid,
    revoked_by_name,
    plan_label: ({
      trial: 'آزمایشی/رایگان',
      month: 'یک‌ماهه',
      quarter: 'سه‌ماهه',
      'half-year': 'شش‌ماهه',
      year: 'یک‌ساله',
      lifetime: 'دائمی',
    } as Record<LicensePlan, string>)[row.plan] ?? row.plan,
  };
}

router.get('/', (_req: Request, res: Response) => {
  res.json(licenseStatus());
});

// ============================================================
// ابطال کد لایسنس (۱.۱۹) — jtiهای باطل‌شده در license_info.revoked_jtis (JSON)
// سناریو: استرداد خرید، سرقت/لو رفتن کد پیش از فعال‌سازی، اشتباه در صدور.
// ابطال جلوی فعال‌سازی را می‌گیرد (activate → 403). توجه: مکانیزم جعلی‌ستیزی
// این سامانه امضای RS256 با کلید خصوصی نزد فروشنده است؛ لیست ابطال یک لایه‌ی
// اضافه است — اگر کد و کلید خصوصی هر دو لو رفته باشند، چرخش کلید لازم است.
// ============================================================
/** خواندن لیست jtiهای باطل‌شده (آرایه‌ی رشته‌ها) — با خودترمیمی اگر خراب بود */
export function getRevokedJtis(db: ReturnType<typeof getDb>): string[] {
  let raw: string | null = null;
  try {
    const row = db.prepare(`SELECT revoked_jtis FROM license_info WHERE id = 1`).get() as { revoked_jtis?: string | null } | undefined;
    raw = row?.revoked_jtis ?? null;
  } catch { /* ستون نیست — DB قدیمی که مهاجرت ندیده */ }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // JSON خراب — به لیست خالی برمی‌گردیم (نوشتن بعدی با '[]' ترمیم می‌کند)
    return [];
  }
}

/** افزودن jti به لیست ابطال (idempotent — بدون تکرار) + ثبت چه‌کسی/کِی */
function addRevokedJti(db: ReturnType<typeof getDb>, jti: string, byUserId: number | null): string[] {
  const cur = getRevokedJtis(db);
  if (!cur.includes(jti)) {
    const next = [...cur, jti];
    db.prepare(`UPDATE license_info SET revoked_jtis = ?, revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now') WHERE id = 1`)
      .run(JSON.stringify(next), byUserId);
    return next;
  }
  db.prepare(`UPDATE license_info SET revoked_at = datetime('now'), revoked_by = ? WHERE id = 1`).run(byUserId);
  return cur;
}

/** حذف jti از لیست ابطال (idempotent) */
function removeRevokedJti(db: ReturnType<typeof getDb>, jti: string): string[] {
  const cur = getRevokedJtis(db);
  if (!cur.includes(jti)) return cur;
  const next = cur.filter((x) => x !== jti);
  db.prepare(`UPDATE license_info SET revoked_jtis = ?, updated_at = datetime('now') WHERE id = 1`).run(JSON.stringify(next));
  return next;
}

/** آیا این jti در سوابق فعال‌سازی یا رجیستری صدور این سامانه دیده شده؟ */
function isKnownJti(db: DatabaseSync, jti: string): boolean {
  // جدول‌های سوابق/رجیستری — idempotent (برای DBهای قدیمی که schema.sql را ندیده‌اند)
  try {
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
      CREATE TABLE IF NOT EXISTS license_issued (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        jti            TEXT NOT NULL UNIQUE,
        plan           TEXT NOT NULL,
        licensed_to    TEXT,
        email          TEXT,
        note           TEXT,
        code_days      INTEGER,
        issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
        issued_by      INTEGER,
        FOREIGN KEY (issued_by) REFERENCES users(id)
      );
    `);
  } catch { /* */ }
  const a = db.prepare(`SELECT 1 AS x FROM license_activations WHERE jti = ? LIMIT 1`).get(jti) as { x?: number } | undefined;
  if (a) return true;
  const i = db.prepare(`SELECT 1 AS x FROM license_issued WHERE jti = ? LIMIT 1`).get(jti) as { x?: number } | undefined;
  return !!i;
}

// ============================================================
// سقف تجهیزات نسخه‌ی رایگان/آزمایشی
// TRIAL_DEVICE_LIMIT (پیش‌فرض ۲۵) — با طرح‌های پرداختی یا lifetime بلامانع.
// چک فقط وقتی اعمال می‌شود که TRIAL_LIMIT_ENFORCE=1 باشد؛ در غیر این صورت
// سقف فقط گزارش می‌شود (usage.limit_reached همیشه false) تا نسخه‌ی فعلی بلاک نشود.
// ============================================================
export const TRIAL_DEVICE_LIMIT = Math.max(1, Number(process.env.TRIAL_DEVICE_LIMIT) || 25);

export interface DeviceLimitInfo {
  limit: number | null;          // null = بدون سقف (طرح پرداختی/lifetime یا enforce خاموش؟ نه — سقف مستقل از enforce گزارش می‌شود)
  used: number;
  remaining: number | null;
  is_trial: boolean;
  enforce: boolean;
  limit_reached: boolean;
  message: string | null;
}

/** وضعیت سقف تجهیزات بر اساس طرح لایسنس فعلی */
export function deviceLimitInfo(deviceCount?: number): DeviceLimitInfo {
  const { plan, enforce: licenseEnforce } = licenseStatus();
  const is_trial = plan === 'trial';
  const limit = is_trial ? TRIAL_DEVICE_LIMIT : null;
  const used = deviceCount ?? (getDb().prepare(`SELECT COUNT(*) AS c FROM devices`).get() as { c: number }).c;
  const remaining = limit !== null ? Math.max(0, limit - used) : null;
  const enforceLimit = is_trial && process.env.TRIAL_LIMIT_ENFORCE === '1';
  const limit_reached = enforceLimit && limit !== null && used >= limit;
  const message = is_trial && limit !== null
    ? (limit_reached
      // منبع واحد مشترک — کلاینت (client/src/lib/upgrade.ts) از همان shared/app-strings.json می‌خواند
      ? SHARED_STRINGS.license.upgrade402
      : null)
    : null;
  void licenseEnforce;
  return { limit, used, remaining, is_trial, enforce: enforceLimit, limit_reached, message };
}

/** پاسخ 402 (Payment Required) با پیام ارتقا — در routeهای افزودن تجهیز/سریال */
export function upgradeRequiredRes(res: Response, info: DeviceLimitInfo): void {
  res.status(402).json({
    error: info.message,
    upgrade: true,
    limit: info.limit,
    used: info.used,
  });
}

/** GET /api/license/device-limit — وضعیت سقف برای UI */
router.get('/device-limit', (_req: Request, res: Response) => {
  res.json(deviceLimitInfo());
});

const setSchema = z.object({
  plan: z.enum(['trial', 'month', 'quarter', 'half-year', 'year', 'lifetime']),
  starts_at: z.string().optional().nullable(),   // شمسی 1405/07/01 — پیش‌فرض امروز
  expires_at: z.string().optional().nullable(),  // شمسی — برای طرح‌های زمان‌دار
  licensed_to: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  /** فقط برای برگرداندن سامانه به trial (مثلاً تست) — هر تغییر به طرح دیگر کد لایسنس می‌خواهد */
  force_downgrade: z.boolean().optional(),
});

router.put('/', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  const b = parsed.data;
  const db = getDb();
  // ── گیت ضد دور زدن لایسنس (۱.۲۳): تغییر طرح فقط با کد لایسنس میسر است —
  // اگر ادمین مستقیم طرح پرداختی بگذارد، عملاً «ساخت لایسنس رایگان در پنل مشتری» است.
  const current = getLicenseRow();
  const planChanged = b.plan !== current.plan;
  const upgrading = b.plan !== 'trial'; // هر طرح پرداختی = ارتقا
  if (planChanged && upgrading && !b.force_downgrade) {
    return res.status(403).json({
      error: 'تغییر به طرح پرداختی فقط با ورود کد لایسنس معتبر انجام می‌شود — کد را از فروشنده دریافت و در بخش «ورود کد لایسنس» فعال کنید.',
      license_required: true,
    });
  }
  const startsJ = b.starts_at || todayJalali();
  const startsG = jalaliToGregorianISO(startsJ);
  if (!startsG) return res.status(400).json({ error: `تاریخ شروع نامعتبر است: ${startsJ}` });
  // تاریخ پایان: صریح، یا خودکار از طول طرح (ماه → از شروع) — lifetime/trial بدون پایان
  let expiresG: string | null = null;
  if (b.expires_at) {
    expiresG = jalaliToGregorianISO(b.expires_at);
    if (!expiresG) return res.status(400).json({ error: `تاریخ پایان نامعتبر است: ${b.expires_at}` });
  } else {
    const pm = PLAN_MONTHS[b.plan];
    if (pm !== null) {
      const autoJ = addMonthsToJalali(startsJ, pm);
      expiresG = autoJ ? jalaliToGregorianISO(autoJ) : null;
    }
  }
  // تمدید (plan بدون تغییر) مجاز است؛ فقط تغییر به طرح پرداختی قفل است
  const samePlan = b.plan === current.plan;
  const keepStart = samePlan ? current.starts_at : startsG;
  const baseExp = samePlan && b.expires_at === undefined ? current.expires_at : expiresG;
  db.prepare(`
    UPDATE license_info SET
      plan = ?, starts_at = ?, expires_at = ?, licensed_to = ?, notes = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(b.plan, keepStart, baseExp, b.licensed_to ?? null, b.notes ?? null);
  res.json(licenseStatus());
});

// ============================================================
// صدور کد لایسنس در پنل (۱.۲۱) — ساخت کد از داخل سامانه و تحویل به مشتری
// مسیر کلید (به‌ترتیب): ENV LICENSE_ISSUE_KEY (محتوای PEM یا مسیر فایل)
//   → keys/license_private.pem کنار محل اجرا (CWD) → keys/ ریشه‌ی پروژه
//   (نسبت به خود ماژول — تا اجرای سرویس/میان‌بر/داکر/«cd server» کلیدِ موجود را گم نکند).
// کلید خصوصی نزد صادرکننده است؛ اگر نبود، صدور از پنل خطای راهنمادار می‌دهد
// (مسیر scripts/make-license-code.mjs همچنان مستقل کار می‌کند).
// ============================================================
function issueKeyCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url)); // server/src/routes یا server/dist/routes
  return [
    join(process.cwd(), 'keys', 'license_private.pem'),
    join(here, '..', '..', '..', 'keys', 'license_private.pem'), // ریشه‌ی پروژه — در src و dist یکسان
  ];
}

function loadIssuePrivateKey(): string | null {
  const env = process.env.LICENSE_ISSUE_KEY?.trim();
  if (env) {
    if (env.includes('PRIVATE KEY')) return env.replace(/\\n/g, '\n');
    try { if (existsSync(env)) return readFileSync(env, 'utf8'); } catch { /* مسیر نامعتبر — برو سراغ فایل‌ها */ }
  }
  for (const p of issueKeyCandidates()) {
    try { if (existsSync(p)) return readFileSync(p, 'utf8'); } catch { /* */ }
  }
  return null;
}

const ISSUE_PLANS: Record<string, { label: string; months: number | null }> = {
  month: { label: 'یک‌ماهه', months: 1 },
  quarter: { label: 'سه‌ماهه', months: 3 },
  'half-year': { label: 'شش‌ماهه', months: 6 },
  year: { label: 'یک‌ساله', months: 12 },
  lifetime: { label: 'دائمی', months: null },
};

const issueSchema = z.object({
  plan: z.enum(['month', 'quarter', 'half-year', 'year', 'lifetime']),
  to: z.string().min(2).max(120),
  email: z.string().max(120).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
  code_days: z.number().int().min(1).max(3650).optional(), // اعتبار ورود خود کد — پیش‌فرض ۱۸۰
  grouped: z.boolean().optional(),
});

router.post('/issue', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی صدور نامعتبر است.', detail: parsed.error.flatten() });
  const b = parsed.data;
  const priv = loadIssuePrivateKey();
  if (!priv) {
    const tried = issueKeyCandidates().join(' و ');
    console.warn(`⚠ صدور لایسنس: کلید خصوصی پیدا نشد — جست‌وجو: ${tried} + ENV LICENSE_ISSUE_KEY (CWD=${process.cwd()})`);
    return res.status(503).json({
      error: `کلید خصوصی صدور پیدا نشد — این مسیرها بررسی شد: ${tried} و متغیر LICENSE_ISSUE_KEY. فایل keys/license_private.pem را در ریشه‌ی پروژه یا کنار محل اجرا بگذارید، یا مسیر کامل فایل کلید را در LICENSE_ISSUE_KEY تنظیم کنید (صدور خط فرمان با scripts/make-license-code.mjs هم برقرار است).`,
      missing_key: true,
    });
  }
  const jti = [...Array(4)].map(() => randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()).join('-');
  const now = Math.floor(Date.now() / 1000);
  const codeDays = b.code_days ?? 180;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    jti, plan: b.plan, to: b.to.trim(),
    email: b.email?.trim() || null,
    note: b.note?.trim() || null,
    iat: now, exp: now + codeDays * 86400,
  })).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  let token = `${header}.${payload}.${signer.sign(priv, 'base64url')}`;
  if (b.grouped) {
    token = token.split('.').map((seg) => (seg.match(/.{1,24}/g) || [seg]).join('+')).join('.');
  }
  const p = ISSUE_PLANS[b.plan];
  // ثبت در رجیستری صدور — برای known:true در ابطال و گزارش فروش
  const db = getDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS license_issued (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      jti            TEXT NOT NULL UNIQUE,
      plan           TEXT NOT NULL,
      licensed_to    TEXT,
      email          TEXT,
      note           TEXT,
      code_days      INTEGER,
      issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by      INTEGER,
      FOREIGN KEY (issued_by) REFERENCES users(id)
    )`);
    db.prepare(`INSERT OR IGNORE INTO license_issued (jti, plan, licensed_to, email, note, code_days, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(jti, b.plan, b.to.trim(), b.email?.trim() || null, b.note?.trim() || null, codeDays, (req as unknown as { user?: { id?: number } }).user?.id ?? null);
  } catch (err) {
    console.error('⚠ ثبت ledger صدور ناموفق:', (err as Error).message);
  }
  res.status(201).json({
    ok: true,
    jti,
    plan: b.plan,
    plan_label: p.label,
    purchased_months: p.months, // مدت خریداری‌شده (null = دائمی)
    licensed_to: b.to.trim(),
    code: token,
    code_days: codeDays,
    grouped: !!b.grouped,
  });
});

const revokeSchema = z.object({
  jti: z.string().min(1).max(120).optional(),
  code: z.string().min(20).max(4000).optional(), // اگر خودِ کد فرستاده شود، jti از payload تأییدشده استخراج می‌شود (ضد تایپ)
}).refine((d) => d.jti || d.code, { message: 'شناسه‌ی کد (jti) یا خودِ کد را وارد کنید.' });

const extendSchema = z.object({
  months: z.number().int().min(1).max(36),
  from_expiry: z.boolean().optional(), // true = از پایان فعلی تمدید (نه از امروز)
});

router.post('/revoke', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'شناسه‌ی کد (jti) یا خودِ کد را وارد کنید.' });
  let jti: string | undefined = parsed.data.jti?.trim();
  if (!jti && parsed.data.code) {
    try {
      jti = verifyLicenseCode(parsed.data.code).payload.jti;
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message, invalid_code: true });
    }
  }
  if (!jti) return res.status(400).json({ error: 'شناسه‌ی کد (jti) یا خودِ کد را وارد کنید.' });
  const db = getDb();
  // jti ناشناخته هم پذیرفته می‌شود (سناریوی سرقت کدِ فعال‌نشده — هنوز در سوابق نیست)
  // اما known:false در پاسخ برمی‌گردد تا UI هشدار تایپ بدهد؛ خطای تایپ بی‌ضرر است.
  const known = isKnownJti(db, jti);
  const revoked = addRevokedJti(db, jti, (req as unknown as { user?: { id?: number } }).user?.id ?? null);
  res.json({ ok: true, jti, known, revoked_count: revoked.length, revoked: true });
});

router.post('/unrevoke', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'شناسه‌ی کد (jti) یا خودِ کد را وارد کنید.' });
  let jti = (parsed.data.jti ?? '').trim();
  if (!jti && parsed.data.code) {
    try {
      jti = verifyLicenseCode(parsed.data.code).payload.jti;
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message, invalid_code: true });
    }
  }
  if (!jti) return res.status(400).json({ error: 'شناسه‌ی کد (jti) یا خودِ کد را وارد کنید.' });
  const db = getDb();
  const revoked = removeRevokedJti(db, jti);
  res.json({ ok: true, jti, revoked_count: revoked.length, revoked: false });
});

router.get('/revoked', requireRole('admin'), (_req: Request, res: Response) => {
  res.json({ jtis: getRevokedJtis(getDb()) });
});

/** GET /api/license/sales-export.csv — خروجی CSV صدور/فعال‌سازی/ابطال برای حسابداری (فقط ادمین) */
router.get('/sales-export.csv', requireRole('admin'), (_req: Request, res: Response) => {
  const db = getDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS license_issued (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      jti            TEXT NOT NULL UNIQUE,
      plan           TEXT NOT NULL,
      licensed_to    TEXT,
      email          TEXT,
      note           TEXT,
      code_days      INTEGER,
      issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by      INTEGER,
      FOREIGN KEY (issued_by) REFERENCES users(id)
    )`);
  } catch { /* */ }
  const csvEscape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [
    ['نوع رکورد', 'شناسه (jti)', 'طرح', 'دارنده', 'ایمیل', 'فاکتور/یادداشت', 'تاریخ', 'توسط', 'وضعیت'].map(csvEscape).join(','),
  ];
  const issued = db.prepare(`
    SELECT i.*, u.full_name AS by_name,
      (SELECT COUNT(*) FROM license_activations a WHERE a.jti = i.jti) AS activated
    FROM license_issued i LEFT JOIN users u ON u.id = i.issued_by ORDER BY i.id DESC
  `).all() as Array<Record<string, unknown>>;
  for (const r of issued) {
    lines.push(['صدور', r.jti, r.plan, r.licensed_to, r.email, r.note, r.issued_at, r.by_name, r.activated ? 'فعال‌شده' : 'صادرشده'].map(csvEscape).join(','));
  }
  const acts = db.prepare(`
    SELECT a.*, u.full_name AS by_name FROM license_activations a
    LEFT JOIN users u ON u.id = a.activated_by ORDER BY a.id DESC
  `).all() as Array<Record<string, unknown>>;
  for (const r of acts) {
    lines.push(['فعال‌سازی', r.jti, r.plan, r.licensed_to, r.email, r.note, r.activated_at, r.by_name, '—'].map(csvEscape).join(','));
  }
  const revoked = getRevokedJtis(db);
  if (revoked.length > 0) {
    const st = licenseStatus();
    for (const jti of revoked) {
      lines.push(['ابطال', jti, '', '', '', '', st.revoked_at ?? '', st.revoked_by_name ?? '', 'باطل'].map(csvEscape).join(','));
    }
  }
  // BOM برای اکسل فارسی
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="license-sales.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

/** GET /api/license/issued — رجیستری کدهای صادرشده از پنل (فقط ادمین) */
router.get('/issued', requireRole('admin'), (_req: Request, res: Response) => {
  const db = getDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS license_issued (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      jti            TEXT NOT NULL UNIQUE,
      plan           TEXT NOT NULL,
      licensed_to    TEXT,
      email          TEXT,
      note           TEXT,
      code_days      INTEGER,
      issued_at      TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by      INTEGER,
      FOREIGN KEY (issued_by) REFERENCES users(id)
    )`);
  } catch { /* */ }
  const rows = db.prepare(`
    SELECT i.id, i.jti, i.plan, i.licensed_to, i.email, i.note, i.code_days, i.issued_at,
           u.full_name AS issued_by_name,
           (SELECT COUNT(*) FROM license_activations a WHERE a.jti = i.jti) AS activated
    FROM license_issued i LEFT JOIN users u ON u.id = i.issued_by
    ORDER BY i.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

router.post('/extend', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی نامعتبر است.' });
  const { months, from_expiry } = parsed.data;
  const row = getLicenseRow();
  // تمدید فقط برای طرح پرداختی معنا دارد — روی trial راه دور زدن لایسنس است
  if (row.plan === 'trial') {
    return res.status(403).json({ error: 'طرح آزمایشی قابل تمدید نیست — برای ارتقا، کد لایسنس را فعال کنید.', license_required: true });
  }
  const baseJ = (from_expiry && row.expires_at)
    ? (gregorianToJalali(row.expires_at) ?? todayJalali())
    : todayJalali();
  const newEndJ = addMonthsToJalali(baseJ, months);
  if (!newEndJ) return res.status(400).json({ error: 'محاسبه‌ی تاریخ پایان ناموفق بود.' });
  const newEndG = jalaliToGregorianISO(newEndJ);
  const db = getDb();
  db.prepare(`UPDATE license_info SET expires_at = ?, updated_at = datetime('now') WHERE id = 1`).run(newEndG);
  res.json(licenseStatus());
});

export default router;
