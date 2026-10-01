// ============================================================
// سامانه‌ی مدیریت پروژه و تجهیزات — سرور Express
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com — +989022964006
// API و فایل‌های بیلد فرانت‌اند روی یک پورت (پیش‌فرض 4000) سرو می‌شوند.
// نقش‌ها: 'admin' (دسترسی کامل) و 'user' (فقط مشاهده/جستجو).
// ============================================================
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';

import { getDb, applySchema, migrateSchema } from './db/db.js';
import { seedIfEmpty } from './db/init.js';
import { authRequired, requireRole, errorHandler } from './middleware/auth.js';
import { startBackupScheduler, backupOnce, backupStatus, listBackups, backupDir, prepareRestore, confirmRestore, restorePendingMarkerPath } from './lib/backup.js';
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
import searchRoutes from './routes/search.js';
import partCatalogRoutes from './routes/partCatalog.js';
import licenseRoutes from './routes/license.js';
import licenseActivateRoutes from './routes/licenseActivate.js';

config();

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
const SUPPORT_BLOCKED_PREFIXES = ['/api/devices', '/api/parts', '/api/warranty', '/api/serial-import', '/api/backups', '/api/procurement'];
if (SUPPORT_ONLY) {
  console.log('🛟 حالت سرور پشتیبانی (SUPPORT_ONLY=1) — مسیرهای داده‌ی واقعی غیرفعال‌اند.');
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- سلامت و ورژن سرور ---
// APP_VERSION در Dockerfile/runtime ست می‌شود؛ fallback برای اجرای dev محلی
// support_only برای بنر ثابت UI (۱.۲۵) — کاربر بداند روی سرور پشتیبانی است
const APP_VERSION = process.env.APP_VERSION || 'dev';
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), support_only: SUPPORT_ONLY });
});
app.get('/api/version', (_req, res) => {
  res.json({ version: APP_VERSION, support_only: SUPPORT_ONLY });
});

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
app.use('/api/dashboard', authRequired, dashboardRoutes);
app.use('/api/search', authRequired, searchRoutes);
app.use('/api/part-catalog', authRequired, partCatalogRoutes);
app.use('/api/license', authRequired, licenseRoutes);
app.use('/api/license', authRequired, licenseActivateRoutes);

// --- پشتیبان‌گیری (فقط ادمین) ---
// GET /api/backups — فهرست بکاپ‌ها + وضعیت زمان‌بند
app.get('/api/backups', authRequired, requireRole('admin'), (_req, res) => {
  res.json({ ...backupStatus(), items: listBackups() });
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
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
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
