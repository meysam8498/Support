// ============================================================
// سامانه‌ی مدیریت پروژه و تجهیزات — سرور Express
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com — +989022964006
// API و فایل‌های بیلد فرانت‌اند روی یک پورت (پیش‌فرض 4000) سرو می‌شوند.
// نقش‌ها: 'admin' (دسترسی کامل) و 'user' (فقط مشاهده/جستجو).
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { inspect } from 'node:util';

import { getDb, applySchema, migrateSchema } from './db/db.js';
import { seedIfEmpty } from './db/init.js';
import { authRequired, requireRole, errorHandler } from './middleware/auth.js';
import { startBackupScheduler, backupOnce, backupStatus, backupHistory, listBackups, backupDir, prepareRestore, confirmRestore, restorePendingMarkerPath } from './lib/backup.js';
import authRoutes from './routes/auth.js';
import listsRoutes from './routes/lists.js';
import devicesRoutes from './routes/devices.js';
import partsRoutes from './routes/parts.js';
import warrantyRoutes from './routes/warranty.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import usersRoutes from './routes/users.js';
import warrantyRequestRoutes from './routes/warrantyRequests.js';
import procurementRoutes from './routes/procurement.js';
import serialImportRoutes from './routes/serialImport.js';
import serialImportMobileRoutes from './routes/serialImportMobile.js';
import searchRoutes from './routes/search.js';
import partCatalogRoutes from './routes/partCatalog.js';
import licenseRoutes from './routes/license.js';
import licenseActivateRoutes from './routes/licenseActivate.js';

config();

// ─────────────────────────────────────────────────────────────
// بافر لاگ درون‌حافظه‌ای (۱.۲۷) — گزارش لاگ سرور برای پشتیبانی
// همه‌ی console.log/error را می‌گیرد و در حلقه‌ی محدود نگه می‌دارد؛
// مسیر GET /api/logs فقط در حالت SUPPORT_ONLY با هدر X-Support-Token باز است
// (بدون توکن، ۴۰۱؛ توکن از ENV پشتیبانی: SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN).
// در داکر/سرور معمولی داده‌ای لو نمی‌رود: مسیر بدون SUPPORT_ONLY اصلاً mount نمی‌شود.
// ─────────────────────────────────────────────────────────────
const LOG_RING_MAX = 500;
type LogEntry = { t: string; level: 'info' | 'error'; msg: string };
const logRing: LogEntry[] = [];
function pushLog(level: LogEntry['level'], args: unknown[]): void {
  try {
    const msg = args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' ').slice(0, 500);
    logRing.push({ t: new Date().toISOString(), level, msg });
    if (logRing.length > LOG_RING_MAX) logRing.splice(0, logRing.length - LOG_RING_MAX);
  } catch { /* noop */ }
}
const _clog = console.log.bind(console);
const _cerr = console.error.bind(console);
console.log = (...args: unknown[]) => { pushLog('info', args); _clog(...args); };
console.error = (...args: unknown[]) => { pushLog('error', args); _cerr(...args); };

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

// ─────────────────────────────────────────────────────────────
// حالت سرورِ پشتیبانی (۱.۲۴) — SUPPORT_ONLY=1
// نسخه‌ای فقط برای بررسی/رفع ایراد مشتری‌ها: با لاگ مشتری یا درخواست اتصال
// کار می‌کند؛ داده‌ی واقعی مشتری را نگه نمی‌دارد و صدور لایسنس اینجاست.
// اثر: ورود/جست‌وجوی نمونه، خواندن سلامت/ورژن/لاگ و ابزارهای لایسنس فعال‌اند؛
// مسیرهای داده‌ی واقعی (devices/parts/warranty/serial-import/backups) بسته‌اند.
// ─────────────────────────────────────────────────────────────
const SUPPORT_ONLY = process.env.SUPPORT_ONLY === '1';

// مقایسه‌ی امن توکن پشتیبانی (timing-safe) — توکن از ENV
function supportLogTokenOk(provided: string): boolean {
  const expected = process.env.SUPPORT_LOG_TOKEN || process.env.SUPPORT_TOKEN || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const SUPPORT_BLOCKED_PREFIXES = ['/api/devices', '/api/parts', '/api/warranty', '/api/serial-import', '/api/backups', '/api/procurement'];
if (SUPPORT_ONLY) {
  console.log('🛟 حالت سرور پشتیبانی (SUPPORT_ONLY=1) — مسیرهای داده‌ی واقعی غیرفعال‌اند.');
}

const app = express();

// ─────────────────────────────────────────────────────────────
// سخت‌سازی HTTP (۱.۲۸.۰):
//   helmet — هدرهای امنیتی استاندارد؛ CSP برای فرانت‌اند بیلد‌شده بسیار سخت‌گیرانه نمی‌شود
//   تا اگر اسکریپت inline در HTML تولیدی باشد، اولویت را نسوزانیم.
//   CORS — روی نصب مشتری، فرانت روی همان پورت سرور می‌آید؛ پس origin پیش‌فرض محدود است.
//     CORS_ALLOWED_ORIGINS برای dev کلاینت جدا (مثلاً http://localhost:5173).
// ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // tailwind inline style که در بیلد فرانت تولید می‌شود
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", "'unsafe-inline'"], // vite build با chunk inline کار می‌کند
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

const CORS_ALLOWED = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (CORS_ALLOWED.length > 0) {
  app.use(cors({ origin: CORS_ALLOWED, credentials: true }));
  console.log(`🔒 CORS محدود شد به ${CORS_ALLOWED.join(', ')}`);
} else {
  // روی نصب مشتری فرانت و API هم‌پورت‌اند؛ بدون CORS هم کار می‌کند. برای dev کلاینت جدا،
  // CORS_ALLOWED_ORIGINS را در ENV بگذارید (http://localhost:5173).
  app.use(cors({ origin: false, credentials: true }));
  console.log('🔒 CORS محدود به خود سرور (origin: false) — CORS_ALLOWED_ORIGINS برای dev جدا تنظیم کنید (لینک ۱.۲۸.۰).');
}

app.use(express.json({ limit: '5mb' }));

// ─────────────────────────────────────────────────────────────
// rate limit (۱.۲۸.۰) — auto (مسیر login و بررسی/فعال‌سازی لایسنس)
// ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'تلاش زیاد برای ورود — ۱۵ دقیقه صبر کنید.' } });
const licenseLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'درخواست زیاد روی لایسنس — یک دقیقه صبر کنید.' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/license', licenseLimiter);

// --- سلامت و ورژن سرور ---
// APP_VERSION در Dockerfile/runtime ست می‌شود؛ fallback برای اجرای dev محلی
// support_only برای بنر ثابت UI (۱.۲۵) — کاربر بداند روی سرور پشتیبانی است
const APP_VERSION = process.env.APP_VERSION || 'dev';
// نسخه‌ی سرور (۱.۲۹) — شماره‌گذاری مستقل از نسخه‌ی محصول/مشتری (که از تگ گیت می‌آید).
// از server/package.json خوانده می‌شود: هم در dev (از src/) و هم در تولید (از dist/)
// ماژول یک سطح بالاتر است، پس همین مسیر در هر دو حالت درست خوانده می‌شود.
// کاربرد: تشخیص نسخه‌ی backend برای خودِ فروشنده/پشتیبانی؛ مشتری نسخه‌ی محصول را می‌بیند.
let SERVER_VERSION = 'dev';
try {
  SERVER_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || 'dev';
} catch { /* بی‌صدا — اگر package.json در دسترس نبود */ }
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), support_only: SUPPORT_ONLY });
});
app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION, server_version: SERVER_VERSION, support_only: SUPPORT_ONLY });
});

// --- گزارش لاگ سرور برای اشکال‌زدایی مشتری (۱.۲۷) ---
// فقط در حالت SUPPORT_ONLY mount می‌شود؛ بدون توکن → ۴۰۱؛ توکن غلط → ۴۰۱
// ?lines=N تا سقف ۲۰۰ خط آخر را برمی‌گرداند؛ هدر no-store تا هیچ کشی لاگ را نگه ندارد
if (SUPPORT_ONLY) {
  app.get('/api/logs', (req, res) => {
    const token = String(req.headers['x-support-token'] || '');
    if (!token) {
      res.status(401).json({ error: 'توکن پشتیبانی الزامی است (هدر X-Support-Token).' });
      return;
    }
    if (!supportLogTokenOk(token)) {
      res.status(401).json({ error: 'توکن پشتیبانی نامعتبر است.' });
      return;
    }
    const lines = Math.min(Math.max(parseInt(String(req.query.lines || ''), 10) || 100, 1), 200);
    const entries = logRing.slice(-lines);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ support_only: true, version: APP_VERSION, total: logRing.length, entries });
  });
}

// --- گیت حالت پشتیبانی — قبل از همه‌ی مسیرهای محافظت‌شده ---
// ⚠️ روی mount سطح app، req.path مسیر کامل است؛ برای اطمینان از originalUrl استفاده می‌کنیم
if (SUPPORT_ONLY) {
  app.use((req, res, next) => {
    const url = req.originalUrl.split('?')[0];
    if (SUPPORT_BLOCKED_PREFIXES.some((p) => url === p || url.startsWith(p + '/'))) {
      return res.status(403).json({
        error: 'این سرور فقط برای پشتیبانی است (SUPPORT_ONLY) — داده‌ی مشتری اینجا نگه‌داری نمی‌شود.',
        support_only: true,
      });
    }
    next();
  });
}

// --- مسیرهای عمومی ---
app.use('/api/auth', authRoutes);

// --- مسیرهای محافظت‌شده ---
app.use('/api/lists', authRequired, listsRoutes);
app.use('/api/devices', authRequired, devicesRoutes);
app.use('/api/parts', authRequired, partsRoutes);
app.use('/api/warranty', authRequired, warrantyRoutes);
app.use('/api/warranty-requests', authRequired, warrantyRequestRoutes);
app.use('/api/procurement', authRequired, procurementRoutes);
app.use('/api/serial-import', authRequired, serialImportRoutes);
app.use('/api/serial-import', authRequired, serialImportMobileRoutes); // اپ موبایل (بارکدخوان) — PACKAGING.md بخش ۲
app.use('/api/dashboard', authRequired, dashboardRoutes);
app.use('/api/search', authRequired, searchRoutes);
app.use('/api/part-catalog', authRequired, partCatalogRoutes);
app.use('/api/license', authRequired, licenseRoutes);
app.use('/api/license', authRequired, licenseActivateRoutes);

// --- پشتیبان‌گیری (فقط ادمین) ---
// GET /api/backups — فهرست بکاپ‌ها + وضعیت زمان‌بند + تاریخچه‌ی ثبت‌شده در DB (برای نمودار خطی داشبورد)
app.get('/api/backups', authRequired, requireRole('admin'), (_req, res) => {
  res.json({ ...backupStatus(), items: listBackups(), history: backupHistory(getDb()) });
});
// POST /api/backups/run — بکاپ دستی (فوری)
app.post('/api/backups/run', authRequired, requireRole('admin'), async (_req, res) => {
  const r = await backupOnce(getDb());
  res.status(r.ok ? 200 : 500).json(r);
});
// POST /api/backups/restore/prepare — مرحله‌ی ۱ بازیابی: اعتبارسنجی + بکاپ ایمنی + توکن
app.post('/api/backups/restore/prepare', authRequired, requireRole('admin'), (req, res) => {
  const file = String((req.body as { file?: string })?.file ?? '');
  const r = prepareRestore(getDb(), file, String(req.user!.sub));
  res.status(r.ok ? 200 : 400).json(r);
});
// POST /api/backups/restore/confirm — مرحله‌ی ۲ بازیابی: جایگزینی + ری‌استارت (توکن یک‌بارمصرف ۱۵دقیقه‌ای)
app.post('/api/backups/restore/confirm', authRequired, requireRole('admin'), (req, res) => {
  const token = String((req.body as { token?: string })?.token ?? '');
  const r = confirmRestore(getDb(), token);
  if (r.ok) {
    // پاسخ ارسال می‌شود و بلافاصله‌ی بعد پروسه خاتمه می‌یابد تا کانتینر با دیتابیس بازیابی‌شده بالا بیاید
    res.json(r);
  } else {
    res.status(400).json(r);
  }
});
// GET /api/backups/:file — دانلود یک بکاپ (نام محدودشده به الگوی خودمان — بدون path traversal)
app.get('/api/backups/:file', authRequired, requireRole('admin'), (req, res) => {
  const f = String(req.params.file);
  if (!/^support-backup-\d{8}-\d{6}\.db$/.test(f)) return res.status(400).json({ error: 'نام فایل نامعتبر است.' });
  const filePath = path.join(backupDir(), f);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'فایل بکاپ یافت نشد.' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${f}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});
app.use('/api/reports', authRequired, reportsRoutes);
app.use('/api/users', authRequired, usersRoutes); // فقط مدیر (درون روتر چک می‌شود)

// --- سرو فایل‌های بیلد فرانت‌اند در محیط تولید ---
// در نصب دسکتاپ (Tauri) مسیر فرانت با CLIENT_DIST داده می‌شود؛ پیش‌فرض: مخزن کنار سرور
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '..', '..', 'client', 'dist');
// کش فایل‌های بیلد (۱.۲۸): vite نام فایل‌های dist/assets را با هش محتوا می‌سازد (مثلاً index-DMZex_8L.js)،
// پس محتوا عوض شود نام هم عوض می‌شود و می‌توان برای یک سال immutable کش کرد — با هر deploy
// فایل جدید است و کلاینت بدون هیچ revalidate از کش می‌خواند.
// اما سند ورودی (index.html و هر فایل بدون هش) باید همیشه revalidate شود (no-cache)
// تا کلاینت‌های قدیمی بعد از deploy سراغ چانک‌های تازه بروند؛ وگرنه گیر کردن در نسخه‌ی قدیمی ممکن است.
app.use(express.static(clientDist, {
  setHeaders(res, filePath) {
    const isHashedAsset = filePath.split(path.sep).includes('assets');
    res.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
  },
}));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache'); // سند ورودی SPA — همیشه تازه‌ترین نسخه
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

// مقداردهی اولیه پایگاه داده هنگام راه‌اندازی:
// اعمال اسکما (idempotent) و سپس، در صورت خالی بودن، seed اولیه (مهم برای Docker).
const db = getDb();

// اگر مرحله‌ی ۲ بازیابی تازه انجام شده، نشانگرش را پاک کن و گزارش بده
try {
  const marker = restorePendingMarkerPath();
  if (existsSync(marker)) {
    const { readFileSync, unlinkSync } = await import('node:fs');
    try { console.log(`♻️ بازیابی دیتابیس انجام شد: ${readFileSync(marker, 'utf8')}`); } catch { /* noop */ }
    unlinkSync(marker);
  }
} catch { /* noop */ }

migrateSchema(db);   // اول ستون‌های جاافتاده‌ی نسخه‌های قدیمی اضافه می‌شود
applySchema(db);     // سپس جداول/ایندکس‌های جدید ساخته می‌شوند (idempotent)
seedIfEmpty();

// زمان‌بند بکاپ روزانه (پیش‌فرض ۰۳:۳۰، نگهداری ۳۰ نسخه — BACKUP_AT/BACKUP_KEEP/BACKUP_DIR)
startBackupScheduler(getDb());

app.listen(PORT, () => {
  console.log(`✓ سرور در حال اجراست: http://localhost:${PORT}`);
  console.log(`  حساب پیش‌فرض: admin / admin123`);
});
