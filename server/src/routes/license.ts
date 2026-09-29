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
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';
import { todayGregorian, todayJalali, addMonthsToJalali, jalaliToGregorianISO, gregorianToJalali } from '../lib/date.js';

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
  return {
    ...row,
    enforce,
    days_left: daysLeft,
    expired,
    valid,
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
      ? `سقف نسخه‌ی آزمایشی (${TRIAL_DEVICE_LIMIT} تجهیز) پر شده است — برای افزودن بیشتر، سامانه را ارتقا دهید.`
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
});

router.put('/', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی نامعتبر است.', detail: parsed.error.flatten() });
  const b = parsed.data;
  const db = getDb();
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
  db.prepare(`
    UPDATE license_info SET
      plan = ?, starts_at = ?, expires_at = ?, licensed_to = ?, notes = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(b.plan, startsG, expiresG, b.licensed_to ?? null, b.notes ?? null);
  res.json(licenseStatus());
});

const extendSchema = z.object({
  months: z.number().int().min(1).max(36),
  from_expiry: z.boolean().optional(), // true = از پایان فعلی تمدید (نه از امروز)
});

router.post('/extend', requireRole('admin'), (req: Request, res: Response) => {
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ورودی نامعتبر است.' });
  const { months, from_expiry } = parsed.data;
  const row = getLicenseRow();
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
