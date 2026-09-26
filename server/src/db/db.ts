import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// مسیر فایل پایگاه داده — قابل تنظیم با متغیر محیطی
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
