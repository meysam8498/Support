// ============================================================
// راه‌انداز پایگاه داده: اعمال اسکما + seed اولیه (در صورت خالی بودن)
// طراح و توسعه‌دهنده: میثام ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
//  • اجرای مستقیم این فایل: ساخت/به‌روزرسانی اسکما و سپس seed.
//  • با پرچم --reset: حذف فایل فعلی و بازسازی کامل + seed.
//  • تابع seedIfEmpty توسط index.ts هم هنگام اولین استارت سرور فراخوانی
//    می‌شود تا محیط‌هایی مثل Docker (با دیتابیس خالی) خودکار مقداردهی شوند.
// ----------------------------------------------------------------
// حساب مدیر به‌صورت پیش‌فرض از متغیرهای محیطی خوانده می‌شود:
//   ADMIN_USERNAME (پیش‌فرض: admin)   و   ADMIN_PASSWORD (پیش‌فرض: admin123)
// همچنین یک کاربر نمونه‌ی فقط‌مشاهده با USER_USERNAME/USER_PASSWORD ساخته می‌شود
// (پیش‌فرض: user / user123) برای تست نقش 'user'.
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

  // --- کاربران ----------------------------------------------------------------
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const userUsername = process.env.USER_USERNAME || 'user';
  const userPassword = process.env.USER_PASSWORD || 'user123';

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, 'admin')`
  ).run(adminUsername, hashPassword(adminPassword), 'مدیر سیستم', 'admin@example.com');

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, 'user')`
  ).run(userUsername, hashPassword(userPassword), 'کاربر نمونه (فقط مشاهده)', 'user@example.com');

  // ------------------------------------------------------------------
  // کارشناسان واقعی سازمان (از جدول پرسنلی) — فروش و فنی
  // فرمت: [نام کامل، تلفن، واحد (sales/fny/other)]
  // ------------------------------------------------------------------
  const PERSONNEL: [string, string, 'sales' | 'tech'][] = [
    ['پاشا بابايي مجيد آباد', '09354363073', 'tech'],
    ['سپيده حاجي نوروزي', '09379750607', 'sales'],
    ['مهيار ذوالفقاري شهريور', '09124579098', 'tech'],
    ['حسام اصغري تير آبادي', '09362243840', 'tech'],
    ['روناك كاظمي', '09128577754', 'sales'],
    ['عليرضا هوشمند مفرد', '09339056349', 'tech'],
    ['اميرحسين رحيمي صدوده', '09197709980', 'tech'],
    ['رامتین امیری زاده', '09126702942', 'sales'], // مناقصات — در لیست فروش نگه می‌شود
    ['محمدرضا شبانی', '09210229248', 'tech'],
    ['پگاه شهوندی', '09939513308', 'sales'],
    ['هادی رشادت زاده', '09123378933', 'tech'],
    ['علی دقیق شعاعی', '09121439785', 'sales'], // انبار — در لیست فروش نگه می‌شود
    ['مهدی مهرانوری', '09125044083', 'tech'],
    ['صبا برزگار', '09129532630', 'tech'],
    ['علی نعمتی آق قلعه', '09330480709', 'tech'],
    ['مریم سلطاني', '09213234088', 'sales'],
    ['امیرشایان رزین', '09120472989', 'sales'],
    ['سهند مددی ورزقانی', '09128932078', 'sales'], // مارکتینگ
    ['مریم فلاح منش', '09123484200', 'sales'], // بازرگانی
    ['حکیمه فرجی', '09902328170', 'sales'],
    ['صغری میرزائی', '09154224691', 'sales'], // منابع انسانی
    ['خشایار احدی ایرانی', '09361772782', 'sales'],
    ['ارشیا رستمی', '09384049794', 'sales'],
    ['متین نجف زاده', '09198799022', 'tech'],
    ['داریوش علیزاده', '09127198705', 'tech'],
    ['مریم السادات مظلوم طبائی زواره', '09010332730', 'sales'],
    ['نازنین کاویانی مرام', '09180160107', 'sales'],
    ['آرش محمودی نژادتیل', '09120697037', 'sales'],
    ['کاظم بازیار', '09370238034', 'sales'], // بازرگانی
    ['فرزاد قانونی', '09940655478', 'sales'],
    ['نسیم لشنی', '09306241977', 'sales'],
    ['مریم فیضی زاده', '09149674701', 'sales'],
    ['میثم ایجادی', '09022964006', 'tech'],
    ['شنو بی نیاز', '09188707655', 'sales'],
    ['مریم دمیرچی', '09918020323', 'sales'], // مناقصات
    ['محمدرضا آسترباف', '09394868212', 'tech'],
    ['الهه خزاعی', '09111005799', 'sales'],
    ['مهدی گرامی', '09111111111', 'sales'], // بازرگانی — تلفن ندارد؛ placeholder
    ['بنفشه احمدی', '09935015641', 'sales'],
    ['سارا معزی', '09121487607', 'sales'],
  ];

  const insertSales = db.prepare(`INSERT INTO sales_experts (name, phone) VALUES (?, ?)`);
  const insertTech = db.prepare(`INSERT INTO technical_experts (name, phone) VALUES (?, ?)`);
  let salesCount = 0;
  let techCount = 0;
  const expertIds = new Map<string, number>();

  for (const [fullName, phone, kind] of PERSONNEL) {
    if (kind === 'sales') {
      const id = insertSales.run(fullName, phone).lastInsertRowid as number;
      expertIds.set(fullName, id);
      salesCount++;
    } else {
      const id = insertTech.run(fullName, phone).lastInsertRowid as number;
      expertIds.set(fullName, id);
      techCount++;
    }
  }

  // --- دلایل خرابی پایه ------------------------------------------------------
  const insertFailure = db.prepare(`INSERT INTO failure_reasons (name) VALUES (?)`);
  insertFailure.run('خرابی سخت‌افزاری');
  insertFailure.run('خرابی نرم‌افزاری');

  console.log(`→ ${salesCount} کارشناس فروش و ${techCount} کارشناس فنی از جدول پرسنلی وارد شد.`);
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
