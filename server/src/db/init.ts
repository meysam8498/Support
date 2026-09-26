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

  // --- لیست‌های پیش‌تعریف‌شده ----------------------------------------------------
  const salesExperts = [
    ['علی رضایی', '09120000001'],
    ['مریم احمدی', '09120000002'],
  ];
  const insertSales = db.prepare(`INSERT INTO sales_experts (name, phone) VALUES (?, ?)`);
  const salesIds = salesExperts.map((s) => insertSales.run(...s).lastInsertRowid as number);

  const techExperts = [
    ['حسین کریمی', '09120000003'],
    ['زهرا موسوی', '09120000004'],
  ];
  const insertTech = db.prepare(`INSERT INTO technical_experts (name, phone) VALUES (?, ?)`);
  const techIds = techExperts.map((t) => insertTech.run(...t).lastInsertRowid as number);

  const insertBrand = db.prepare(`INSERT INTO brands (name) VALUES (?)`);
  const brandIds = ['HP', 'Dell', 'Cisco', 'Eaton'].map((b) => insertBrand.run(b).lastInsertRowid as number);
  const [hpId, dellId, ciscoId] = brandIds;

  const insertType = db.prepare(`INSERT INTO device_types (name) VALUES (?)`);
  const typeIds = ['سرور', 'سوئیچ شبکه', 'یو‌پی‌اس', 'روتر'].map(
    (t) => insertType.run(t).lastInsertRowid as number
  );
  const [, switchTypeId] = typeIds;

  const insertModel = db.prepare(`INSERT INTO device_models (brand_id, name) VALUES (?, ?)`);
  const hpModelId = insertModel.run(hpId, 'ProLiant DL380').lastInsertRowid as number;
  const ciscoModelId = insertModel.run(ciscoId, 'Catalyst 2960').lastInsertRowid as number;
  const dellModelId = insertModel.run(dellId, 'PowerEdge R650').lastInsertRowid as number;

  const insertFailure = db.prepare(`INSERT INTO failure_reasons (name) VALUES (?)`);
  insertFailure.run('خرابی سخت‌افزاری');
  insertFailure.run('خرابی نرم‌افزاری');

  const insertProject = db.prepare(
    `INSERT INTO projects (name, contract_number, sales_expert_id) VALUES (?, ?, ?)`
  );
  const proj1 = insertProject.run('پروژه بیمارستان میلاد', 'C-1402-001', salesIds[0]).lastInsertRowid as number;
  const proj2 = insertProject.run('پروژه بانک کشاورزی', 'C-1402-002', salesIds[1]).lastInsertRowid as number;

  // --- تجهیزات نمونه (با فیلدهای کامل: انبار، تحویل، گارانتی، وضعیت) ------------
  const insertDevice = db.prepare(`
    INSERT INTO devices
      (project_id, contract_number, sales_expert_id, main_serial, part_number_1, part_number_2,
       device_type_id, device_model_id, brand_id, technical_expert_id, description, status,
       warehouse_exit_jalali, warehouse_exit_gregorian,
       customer_delivery_jalali, customer_delivery_gregorian,
       warranty_duration_months, warranty_start_jalali, warranty_start_gregorian,
       warranty_end_jalali, warranty_end_gregorian,
       sold_at_jalali, sold_at_gregorian, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  // dev1: تحویل‌شده + گارانتی ۲۴ ماهه از ۱۴۰۲/۰۵/۱۵
  const dev1 = insertDevice.run(
    proj1, 'C-1402-001', salesIds[0], 'SN-DEV-1001', 'PN-SW-1001', 'PN-SW-1001-V2',
    switchTypeId, ciscoModelId, ciscoId, techIds[0], 'سوئیچ شبکه مرکزی دیتاسنتر', 'active',
    '1402/05/10', '2023-08-01',    // خروج از انبار
    '1402/05/15', '2023-08-06',    // تحویل به مشتری
    24, '1402/05/15', '2023-08-06',// گارانتی ۲۴ ماهه
    '1404/05/15', '2025-08-06',    // پایان گارانتی
    '1402/05/15', '2023-08-06'
  ).lastInsertRowid as number;

  // dev2: در حال تعویض (نمونه‌ی وضعیت)
  const dev2 = insertDevice.run(
    proj2, 'C-1402-002', salesIds[1], 'SN-DEV-1002', 'PN-SRV-2001', 'PN-SRV-2001-V2',
    typeIds[0], hpModelId, hpId, techIds[1], 'سرور اصلی بانک', 'replacing',
    '1402/06/20', '2023-09-11',
    '1402/07/01', '2023-09-22',
    36, '1402/07/01', '2023-09-22',
    '1405/07/01', '2026-09-22',
    '1402/07/01', '2023-09-22'
  ).lastInsertRowid as number;

  // --- قطعات نمونه -----------------------------------------------------------
  const insertPart = db.prepare(`
    INSERT INTO parts
      (device_id, title, tech_specs, part_number_1, part_number_2, part_serial_number,
       status, sold_at_jalali, sold_at_gregorian, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 1)
  `);
  const part1 = insertPart.run(
    dev1, 'منبع تغذیه سوئیچ', '650W redundant', 'PWR-650', 'PWR-650-V2',
    'PS-5001', '1402/05/15', '2023-08-06'
  ).lastInsertRowid as number;
  const part2 = insertPart.run(
    dev1, 'ماژول SFP+', '10Gb/s', 'SFP-10G-LR', '', 'SFP-7002',
    '1402/05/15', '2023-08-06'
  ).lastInsertRowid as number;
  // قطعه‌ی معیوب نمونه برای دستگاه دوم
  const part3 = insertPart.run(
    dev2, 'هارد SSD', '960GB Enterprise', 'SSD-960E', 'SSD-960E-V2',
    'SSD-9001', '1402/07/01', '2023-09-22'
  ).lastInsertRowid as number;

  // --- تأمین قطعات نمونه (Procurement) --------------------------------------
  const insertProc = db.prepare(`
    INSERT INTO procurement
      (part_id, source, source_detail, purchase_jalali, purchase_gregorian,
       supplier_warranty_months, extra_notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertProc.run(
    part1, 'internal', 'انبار مرکزی تهران', '1402/04/01', '2023-06-22',
    36, 'خریداری از نمایندگی رسمی'
  ).lastInsertRowid as number;
  insertProc.run(
    part2, 'external', 'DUB-HQ (دبی)', '1402/04/10', '2023-07-01',
    24, 'واردات مستقیم'
  ).lastInsertRowid as number;

  // --- درخواست گارانتی نمونه -------------------------------------------------
  db.prepare(`
    INSERT INTO warranty_requests
      (device_id, description, status, request_jalali, request_gregorian, created_by)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(dev2, 'سخت‌افزار در حال افت توان است؛ نیازمند بررسی و احتمالاً تعویض.', 'pending',
         '1403/11/10', '2025-01-30');

  console.log('→ داده‌های اولیه با موفقیت وارد شدند.');
  console.log(`  حساب مدیر: ${adminUsername} / ${adminPassword}`);
  console.log(`  کاربر فقط‌مشاهده: ${userUsername} / ${userPassword}`);
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
