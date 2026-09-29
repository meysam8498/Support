// ============================================================
// راه‌انداز پایگاه داده: اعمال اسکما + seed اولیه (در صورت خالی بودن)
// طراح و توسعه‌دهنده: میثام ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
//  • اجرای مستقیم این فایل: ساخت/به‌روزرسانی اسکما و سپس seed.
//  • با پرچم --reset: حذف فایل فعلی و بازسازی کامل + seed.
//  • تابع seedIfEmpty توسط index.ts هم هنگام اولین استارت سرور فراخوانی
//    می‌شود تا محیط‌هایی مثل Docker (با دیتابیس خالی) خودکار مقداردهی شوند.
// ----------------------------------------------------------------
// حساب‌های پیش‌فرض از متغیرهای محیطی خوانده می‌شوند:
//   ADMIN_USERNAME/ADMIN_PASSWORD (پیش‌فرض admin/admin123) — مدیر
//   USER_USERNAME/USER_PASSWORD (پیش‌فرض user/user123) — فقط‌مشاهده (viewer)
//   WAREHOUSE_USERNAME/WAREHOUSE_PASSWORD (پیش‌فرض warehouse/warehouse123) — انباردار
//   SALES_USERNAME/SALES_PASSWORD (پیش‌فرض sales/sales123) — کارشناس فروش
//   TECH_USERNAME/TECH_PASSWORD (پیش‌فرض tech/tech123) — کارشناس فنی
// ============================================================
import { getDb, applySchema, migrateSchema } from './db.js';
import { hashPassword } from '../lib/auth.js';
import { todayJalali, todayGregorian } from '../lib/date.js';

/** حذف کامل جداول (ترتیب با توجه به کلیدهای خارجی). */
export function resetDatabase() {
  const db = getDb();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS procurement;
    DROP TABLE IF EXISTS warranty_requests;
    DROP TABLE IF EXISTS warranty_replacements;
    DROP TABLE IF EXISTS parts;
    DROP TABLE IF EXISTS devices;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS device_models;
    DROP TABLE IF EXISTS device_types;
    DROP TABLE IF EXISTS brands;
    DROP TABLE IF EXISTS failure_reasons;
    DROP TABLE IF EXISTS technical_experts;
    DROP TABLE IF EXISTS sales_experts;
    DROP TABLE IF EXISTS users;
    PRAGMA foreign_keys = ON;
  `);
}

/** seed اولیه — فقط هنگام خالی بودن جدول کاربران اجرا می‌شود. */
export function seedDatabase() {
  const db = getDb();

  // اطمینان از اینکه دیتابیس خالی است
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c > 0) {
    console.log('→ پایگاه داده خالی نیست؛ از seed صرف‌نظر شد.');
    return;
  }

  console.log('→ وارد کردن داده‌های اولیه (seed)...');

  // --- کاربران پیش‌فرض (پنج نقش) ----------------------------------------------
  const defaults: { u: string; p: string; name: string; role: 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer' }[] = [
    { u: process.env.ADMIN_USERNAME || 'admin',           p: process.env.ADMIN_PASSWORD || 'admin123',      name: 'مدیر سیستم',                    role: 'admin' },
    { u: process.env.WAREHOUSE_USERNAME || 'warehouse',   p: process.env.WAREHOUSE_PASSWORD || 'warehouse123', name: 'انباردار (پیش‌فرض)',           role: 'warehouse' },
    { u: process.env.SALES_USERNAME || 'sales',           p: process.env.SALES_PASSWORD || 'sales123',      name: 'کارشناس فروش (پیش‌فرض)',          role: 'sales' },
    { u: process.env.TECH_USERNAME || 'tech',             p: process.env.TECH_PASSWORD || 'tech123',        name: 'کارشناس فنی (پیش‌فرض)',           role: 'tech' },
    { u: process.env.USER_USERNAME || 'user',             p: process.env.USER_PASSWORD || 'user123',        name: 'کاربر فقط‌مشاهده',                role: 'viewer' },
  ];
  for (const d of defaults) {
    db.prepare(
      `INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)`
    ).run(d.u, hashPassword(d.p), d.name, `${d.u}@example.com`, d.role);
  }

  // ------------------------------------------------------------------
  // داده‌های نمونه‌ی تستی — قابل حذف از رابط کاربری پس از راه‌اندازی
  // هیچ نام/شماره‌ی واقعی در seed نیست (امنیت). برای راه‌اندازی واقعی،
  // نمونه‌ها را حذف و کارشناسان/پروژه‌های واقعی را از مدیریت لیست‌ها وارد کنید.
  // فرمت: [نام، تلفن، نقش حرفه‌ای (sales/tech/warehouse/business)]
  // ------------------------------------------------------------------
  const SAMPLE_EXPERTS: [string, string, 'sales' | 'tech' | 'warehouse' | 'business'][] = [
    ['کارشناس نمونه — فروش ۱', '09120000001', 'sales'],
    ['کارشناس نمونه — فروش ۲', '09120000002', 'sales'],
    ['کارشناس نمونه — فنی ۱', '09120000003', 'tech'],
    ['کارشناس نمونه — فنی ۲', '09120000004', 'tech'],
    ['کارشناس نمونه — انبار ۱', '09120000005', 'warehouse'],
    ['کارشناس نمونه — بازرگانی ۱', '09120000006', 'business'],
  ];

  const insertSales = db.prepare(`INSERT INTO sales_experts (name, phone, role) VALUES (?, ?, ?)`);
  const insertTech = db.prepare(`INSERT INTO technical_experts (name, phone, role) VALUES (?, ?, ?)`);
  let salesCount = 0;
  let techCount = 0;

  for (const [fullName, phone, prof] of SAMPLE_EXPERTS) {
    if (prof === 'sales' || prof === 'business') {
      insertSales.run(fullName, phone, prof);
      salesCount++;
    } else {
      insertTech.run(fullName, phone, prof);
      techCount++;
    }
  }

  // --- برندها/انواع/مدل‌های نمونه‌ی تستی (قابل حذف از لیست‌ها) ----------------
  const sampleBrands = ['برند نمونه A', 'برند نمونه B'];
  const insBrand = db.prepare(`INSERT INTO brands (name) VALUES (?)`);
  for (const b of sampleBrands) insBrand.run(b);
  const sampleTypes = ['نوع تجهیز نمونه ۱', 'نوع تجهیز نمونه ۲'];
  const insType = db.prepare(`INSERT INTO device_types (name) VALUES (?)`);
  for (const t of sampleTypes) insType.run(t);
  const insModel = db.prepare(`INSERT INTO device_models (brand_id, name) VALUES (?, ?)`);
  insModel.run(1, 'مدل نمونه A-100');
  insModel.run(1, 'مدل نمونه A-200');
  insModel.run(2, 'مدل نمونه B-100');

  // --- پروژه‌ی (مشتری) نمونه — با کارشناس فروش نمونه -------------------------
  db.prepare(`INSERT INTO projects (name, contract_number, sales_expert_id) VALUES (?, ?, ?)`)
    .run('پروژه/مشتری نمونه', 'DEMO-1405-001', 1);

  // --- دلایل خرابی پایه ------------------------------------------------------
  const insertFailure = db.prepare(`INSERT INTO failure_reasons (name) VALUES (?)`);
  insertFailure.run('خرابی سخت‌افزاری');
  insertFailure.run('خرابی نرم‌افزاری');

  console.log(`→ ${salesCount} کارشناس فروش و ${techCount} کارشناس فنی نمونه‌ی تستی وارد شد (قابل حذف از لیست‌ها).`);
  console.log(`  تاریخ امروز (شمسی): ${todayJalali()}  | (میلادی): ${todayGregorian()}`);
}

/**
 * فقط در صورت خالی بودن جدول کاربران، seed اولیه را اعمال می‌کند.
 * برای استارت سرور در محیط‌های تازه (مثل Docker) استفاده می‌شود.
 * اگر داده‌ای موجود باشد، هیچ کاری نمی‌کند.
 */
export function seedIfEmpty(): void {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c > 0) return; // خالی نیست → کاری نکن
  console.log('→ پایگاه داده خالی است؛ اعمال seed اولیه هنگام استارت...');
  seedDatabase();
}

function main() {
  const args = process.argv.slice(2);
  const doReset = args.includes('--reset');

  console.log('› راه‌اندازی پایگاه داده...');
  if (doReset) {
    console.log('→ حالت --reset: حذف جداول موجود...');
    resetDatabase();
  }

  const db = getDb();
  migrateSchema(db);
  applySchema(db);
  console.log('→ اسکما اعمال شد.');

  seedDatabase();
  console.log('✓ پایگاه داده آماده است.');
}

// فقط هنگام اجرای مستقیم این فایل (نه هنگام import) main را اجرا کن.
// این prevents از اجرای دوبار seed وقتی index.ts این ماژول را برای seedIfEmpty import می‌کند.
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const isMainEntry = process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainEntry) {
  main();
}
