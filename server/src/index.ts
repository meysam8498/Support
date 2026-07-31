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

import { getDb, applySchema } from './db/db.js';
import { seedIfEmpty } from './db/init.js';
import { authRequired, errorHandler } from './middleware/auth.js';
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

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- سلامت سرور ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// --- مسیرهای عمومی ---
app.use('/api/auth', authRoutes);

// --- مسیرهای محافظت‌شده ---
app.use('/api/lists', authRequired, listsRoutes);
app.use('/api/devices', authRequired, devicesRoutes);
app.use('/api/parts', authRequired, partsRoutes);
app.use('/api/warranty', authRequired, warrantyRoutes);
app.use('/api/warranty-requests', authRequired, warrantyRequestRoutes);
app.use('/api/procurement', authRequired, procurementRoutes);
app.use('/api/dashboard', authRequired, dashboardRoutes);
app.use('/api/reports', authRequired, reportsRoutes);
app.use('/api/users', authRequired, usersRoutes); // فقط مدیر (درون روتر چک می‌شود)

// --- سرو فایل‌های بیلد فرانت‌اند در محیط تولید ---
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

// مقداردهی اولیه پایگاه داده هنگام راه‌اندازی:
// اعمال اسکما (idempotent) و سپس، در صورت خالی بودن، seed اولیه (مهم برای Docker).
const db = getDb();
applySchema(db);
seedIfEmpty();

app.listen(PORT, () => {
  console.log(`✓ سرور در حال اجراست: http://localhost:${PORT}`);
  console.log(`  حساب پیش‌فرض: admin / admin123`);
});
