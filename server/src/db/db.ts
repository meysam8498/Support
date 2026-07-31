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
