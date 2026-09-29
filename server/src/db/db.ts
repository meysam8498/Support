import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** مسیر فایل پایگاه داده — قابل تنظیم با متغیر محیطی */
export function dbFilePath(): string {
  return resolveDbPath();
}

function resolveDbPath(): string {
  const fromEnv = process.env.DB_PATH;
  if (fromEnv) return resolve(process.cwd(), fromEnv);
  return join(__dirname, '..', '..', 'data', 'app.db');
}

let _db: DatabaseSync | null = null;

/** اتصال singleton به پایگاه داده */
export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  _db = new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  // بهینه‌سازی چندکاربره: WAL خواندن همزمان چند اتصال را ممکن می‌کند؛
  // busy_timeout از خطای SQLITE_BUSY هنگام قفل نوشتن کوتاه جلوگیری می‌کند؛
  // synchronous=NORMAL در WAL سرعت نوشتن را بالا می‌برد با حفظ دوام.
  _db.exec('PRAGMA busy_timeout = 5000');
  _db.exec('PRAGMA synchronous = NORMAL');
  _db.exec('PRAGMA cache_size = -8000'); // ~8MB page cache

  return _db;
}

/** اعمال کامل اسکما روی اتصال فعلی (idempotent) */
export function applySchema(db: DatabaseSync): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
}

// ------------------------------------------------------------
// مهاجرت خودکار اسکیما — برای دیتابیس‌های ساخته‌شده با نسخه‌های قدیمی
// ------------------------------------------------------------
/** ستون‌های جدول را برمی‌گرداند */
function tableColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

interface ColumnMigration {
  table: string;
  column: string;
  ddl: string; // تعریف ستون برای ALTER TABLE ADD COLUMN
}

/**
 * ستون‌هایی که در نسخه‌های قدیمی اسکیما نبودند؛ هرکدام با مقدار پیش‌فرض
 * سازگار اضافه می‌شوند تا داده‌های موجود از بین نرود.
 */
const COLUMN_MIGRATIONS: ColumnMigration[] = [
  // devices — ستون‌های اضافه‌شده در نسخه‌های جدید
  { table: 'devices', column: 'main_serial', ddl: "TEXT" },
  { table: 'devices', column: 'part_number_1', ddl: "TEXT" },
  { table: 'devices', column: 'part_number_2', ddl: "TEXT" },
  { table: 'devices', column: 'warehouse_exit_jalali', ddl: "TEXT" },
  { table: 'devices', column: 'warehouse_exit_gregorian', ddl: "TEXT" },
  { table: 'devices', column: 'customer_delivery_jalali', ddl: "TEXT" },
  { table: 'devices', column: 'customer_delivery_gregorian', ddl: "TEXT" },
  { table: 'devices', column: 'warranty_duration_months', ddl: "INTEGER" },
  { table: 'devices', column: 'warranty_start_jalali', ddl: "TEXT" },
  { table: 'devices', column: 'warranty_start_gregorian', ddl: "TEXT" },
  { table: 'devices', column: 'warranty_end_jalali', ddl: "TEXT" },
  { table: 'devices', column: 'warranty_end_gregorian', ddl: "TEXT" },
  { table: 'devices', column: 'status', ddl: "TEXT NOT NULL DEFAULT 'active'" },
  { table: 'devices', column: 'replacement_reason_type', ddl: "TEXT" },
  { table: 'devices', column: 'replacement_reason_desc', ddl: "TEXT" },
  // users — active
  { table: 'users', column: 'active', ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: 'users', column: 'email', ddl: "TEXT" },
  // parts — اتصال به کاتالوگ قطعات
  { table: 'parts', column: 'catalog_id', ddl: "INTEGER REFERENCES part_catalog(id)" },
];

/**
 * مهاجرت تدریجی: اگر جدول از قبل وجود دارد ولی ستونی از اسکیمای جدید را ندارد،
 * آن ستون با ALTER TABLE اضافه می‌شود. جدول‌های جدید را schema.sql می‌سازد.
 * این تابع idempotent است و داده‌های موجود را تغییر نمی‌دهد.
 */
export function migrateSchema(db: DatabaseSync): void {
  const tables = new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name)
  );
  if (tables.size === 0) return; // دیتابیس تازه — schema.sql همه را می‌سازد

  // جدول کاتالوگ (اگر نیست) — قبل از ستون catalog_id که به آن ارجاع دارد
  if (!tables.has('part_catalog')) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS part_catalog (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          part_number_1  TEXT NOT NULL,
          part_number_2  TEXT,
          title          TEXT NOT NULL,
          tech_specs     TEXT,
          notes          TEXT,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT,
          UNIQUE (part_number_1)
        );
        CREATE INDEX IF NOT EXISTS idx_part_catalog_pn ON part_catalog(part_number_1);
      `);
      console.log('→ مهاجرت: جدول part_catalog ساخته شد.');
    } catch (err) {
      console.error('⚠ مهاجرت ناموفق (part_catalog):', (err as Error).message);
    }
  }

  for (const m of COLUMN_MIGRATIONS) {
    if (!tables.has(m.table)) continue;
    const cols = tableColumns(db, m.table);
    if (!cols.includes(m.column)) {
      try {
        db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl}`);
        console.log(`→ مهاجرت: ستون ${m.column} به جدول ${m.table} اضافه شد.`);
      } catch (err) {
        console.error(`⚠ مهاجرت ناموفق (${m.table}.${m.column}):`, (err as Error).message);
      }
    }
  }

  // مهاجرت نقش‌ها: 'user' قدیمی → 'viewer' (فقط‌مشاهده) — یک‌بار و idempotent
  try {
    const legacy = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role NOT IN ('admin','warehouse','sales','tech','viewer')`).get() as { c: number };
    if (legacy.c > 0) {
      db.exec(`UPDATE users SET role = 'viewer' WHERE role NOT IN ('admin','warehouse','sales','tech','viewer')`);
      console.log(`→ مهاجرت: ${legacy.c} کاربر با نقش قدیمی به 'viewer' تبدیل شد.`);
    }
  } catch (err) {
    console.error('⚠ مهاجرت ناموفق (roles):', (err as Error).message);
  }

  // مهاجرت ۱.۱۶: ستون نقش حرفه‌ای برای جدول کارشناسان (فنی/فروش/انبار/بازرگانی)
  try {
    for (const t of ['sales_experts', 'technical_experts']) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      if (!cols.includes('role')) {
        db.exec(`ALTER TABLE ${t} ADD COLUMN role TEXT NOT NULL DEFAULT '${t === 'sales_experts' ? 'sales' : 'tech'}'`);
        console.log(`→ مهاجرت: ستون role به جدول ${t} اضافه شد.`);
      }
    }
  } catch (err) {
    console.error('⚠ مهاجرت ناموفق (expert roles):', (err as Error).message);
  }

  // مهاجرت ۱.۱۶: جدول لایسنس — وضعیت/بازه/ایمیل ثبت‌شده (فقط یک ردیف)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS license_info (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        plan           TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'month', 'quarter', 'half-year', 'year', 'lifetime')),
        starts_at      TEXT,
        expires_at     TEXT,
        licensed_to    TEXT,
        notes          TEXT,
        updated_at     TEXT
      );
    `);
    db.prepare(`INSERT OR IGNORE INTO license_info (id, plan, starts_at, expires_at, licensed_to, notes) VALUES (1, 'trial', NULL, NULL, 'ارزیابی', 'نسخه‌ی رایگان — بدون محدودیت زمانی فعلاً')`).run();
  } catch (err) {
    console.error('⚠ مهاجرت ناموفق (license_info):', (err as Error).message);
  }

  // یکتایی سریال قطعه — هر سریال فقط یک بار در کل سامانه (مقدار خالی/NULL مجاز است)
  // اگر داده‌ی تکراری جامانده باشد، ایندکس نمی‌سازیم و هشدار می‌دهیم تا کاربر اصلاح کند
  try {
    const dup = db.prepare(`
      SELECT COUNT(*) AS c FROM (
        SELECT part_serial_number FROM parts
        WHERE part_serial_number IS NOT NULL AND TRIM(part_serial_number) != ''
        GROUP BY UPPER(TRIM(part_serial_number)) HAVING COUNT(*) > 1
      )
    `).get() as { c: number };
    if (dup.c > 0) {
      console.warn(`⚠ مهاجرت: ${dup.c} سریال قطعه‌ی تکراری در داده‌ها هست — ایندکس یکتا ساخته نشد. ابتدا تکراری‌ها را رفع کنید.`);
    } else {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_serial_unique
        ON parts(UPPER(TRIM(part_serial_number)))
        WHERE part_serial_number IS NOT NULL AND TRIM(part_serial_number) != ''
      `);
    }
  } catch (err) {
    console.error('⚠ مهاجرت ناموفق (idx_parts_serial_unique):', (err as Error).message);
  }

  seedPartCatalog(db);
}

/**
 * پرکردن اولیه‌ی کاتالوگ از قطعات موجود — فقط یک بار؛ برای هر پارت‌نامبر
 * یک تعریف مرجع از رایج‌ترین (modal) عنوان/مشخصات ساخته و همه‌ی رکوردهای
 * هم‌پارت‌نامبر به آن وصل می‌شود. توضیحات ناهمگون در notes یادداشت می‌شود.
 */
export function seedPartCatalog(db: DatabaseSync): void {
  const done = db.prepare(`SELECT COUNT(*) AS c FROM part_catalog`).get() as { c: number };
  const linked = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE catalog_id IS NOT NULL AND part_number_1 != ''`).get() as { c: number };
  const total = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE COALESCE(part_number_1, '') != ''`).get() as { c: number };
  if (done.c > 0 && linked.c >= total.c) return; // قبلاً کامل sync شده

  try {
    db.exec('BEGIN');
    const groups = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(part_number_1), ''), '(NO-PN)') AS pn,
             title, tech_specs, COUNT(*) AS cnt
      FROM parts
      WHERE COALESCE(part_number_1, '') != ''
      GROUP BY pn, title, tech_specs
      ORDER BY pn, cnt DESC
    `).all() as { pn: string; title: string; tech_specs: string | null; cnt: number }[];

    // بهترین (پرتکرارترین) عنوان/توضیح برای هر pn — به‌صورت درون‌حافظه‌ای
    const best = new Map<string, { title: string; tech_specs: string | null; cnt: number; variants: string[] }>();
    for (const g of groups) {
      const key = g.pn;
      const cur = best.get(key);
      const specKey = (g.tech_specs || '').trim();
      if (!cur) {
        best.set(key, { title: g.title, tech_specs: specKey || null, cnt: g.cnt, variants: specKey ? [specKey] : [] });
      } else {
        if (g.cnt > cur.cnt) { cur.title = g.title; cur.cnt = g.cnt; }
        if (specKey && !cur.variants.includes(specKey)) cur.variants.push(specKey);
      }
    }

    const insCat = db.prepare(`
      INSERT INTO part_catalog (part_number_1, title, tech_specs, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(part_number_1) DO NOTHING
    `);
    for (const [pn, b] of best) {
      const notes = b.variants.length > 1
        ? `توضیحات ناهمگون پیش از یکسان‌سازی: ${b.variants.join(' | ')}`
        : null;
      insCat.run(pn, b.title, b.tech_specs, notes);
    }

    // اتصال رکوردها به کاتالوگ + یکسان‌سازی عنوان/توضیح با مرجع
    db.exec(`
      UPDATE parts SET
        catalog_id = (SELECT id FROM part_catalog WHERE part_number_1 = COALESCE(NULLIF(TRIM(parts.part_number_1), ''), '(NO-PN)')),
        title = COALESCE((SELECT title FROM part_catalog WHERE part_number_1 = COALESCE(NULLIF(TRIM(parts.part_number_1), ''), '(NO-PN)')), title),
        tech_specs = COALESCE((SELECT tech_specs FROM part_catalog WHERE part_number_1 = COALESCE(NULLIF(TRIM(parts.part_number_1), ''), '(NO-PN)')), tech_specs)
      WHERE COALESCE(part_number_1, '') != ''
    `);

    db.exec('COMMIT');
    const catCount = db.prepare(`SELECT COUNT(*) AS c FROM part_catalog`).get() as { c: number };
    console.log(`→ مهاجرت: کاتالوگ قطعات با ${catCount.c} تعریف مرجع آماده شد.`);
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    console.error('⚠ seedPartCatalog ناموفق:', (err as Error).message);
  }
}

/**
 * اجرای یک تابع درون یک تراکنش.
 * (node:sqlite برخلاف better-sqlite3 متد db.transaction ندارد؛ این پوشش دستی است.)
 */
export function runTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
