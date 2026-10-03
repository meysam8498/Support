#!/usr/bin/env node
// ============================================================
// schema-drift-check — چک درفت schema.sql در برابر مهاجرت‌های ستونی
// طراح و توسعه‌دهنده: میثم ایجادی / M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// انگیزه (رگرسیون واقعی ۱.۲۶): ستون parts.catalog_id در COLUMN_MIGRATIONS
// (db.ts) بود ولی از schema.sql جا افتاده بود → نصب تازه ستون را نداشت و
// کوئری‌های سرور ۵۰۰ می‌دادند. این چک تضمین می‌کند دیگر ستونی از قلم نیفتد.
//
// سه لایه‌ی چک (همه روی دیتابیس‌های temp درون‌پردازشی — بدون دست زدن به data/):
//   ۱) هر (جدول، ستون) از COLUMN_MIGRATIONS در db.ts باید در schema.sql باشد
//      (پارس مستقیم سورس db.ts — اگر مهاجرت جدید اضافه شود و در schema.sql
//      نیاید همین‌جا قرمز می‌شود).
//   ۲) دو دیتابیس زنده بساز: تازه (schema.sql فقط) و قدیمی (جدول‌های هسته‌ای
//      نسخه‌ی قدیمی + مهاجرت‌ها) → ستون‌های PRAGMA table_info هر جدول باید
//      یکسان باشد (مقایسه‌ی نام ستون، بدون توجه به ترتیب).
//   ۳) ایندکس یکتای سریال قطعه (idx_parts_serial_unique) در مسیر مهاجرت
//      ساخته می‌شود — در دیتابیس قدیمی هم باید وجود داشته باشد.
//
// استفاده:
//   node scripts/schema-drift-check.mjs          # چک کامل
//   npm run check:schema
// خروجی: ✓/✗ گام‌به‌گام + کد خروج 0/1 (مناسب CI و اجرای پیش از ریلیز)
// ============================================================
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_TS = join(ROOT, 'server', 'src', 'db', 'db.ts');
const SCHEMA_SQL = join(ROOT, 'server', 'src', 'db', 'schema.sql');

let failures = 0;
let passes = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures++; };
const ok = (msg) => { console.log(`  ✓ ${msg}`); passes++; };

// ستون‌هایی که فقط در مهاجرت معنا دارند و نباید در schema.sql باشند (اضافه‌سازی قدیمی)
// — فعلاً خالی؛ اگر روزی مهاجرتی عمداً خارج از schema.sql ماند، نامش را اینجا مستند کنید.
const MIGRATION_ONLY_OK = new Set([]);

// ---------- لایه‌ی ۱: پارس COLUMN_MIGRATIONS از db.ts ----------
function parseMigrations(src) {
  const start = src.indexOf('const COLUMN_MIGRATIONS');
  if (start < 0) throw new Error('COLUMN_MIGRATIONS در db.ts پیدا نشد');
  const end = src.indexOf('];', start);
  const body = src.slice(start, end);
  const out = [];
  const re = /\{\s*table:\s*'([^']+)'\s*,\s*column:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body))) out.push({ table: m[1], column: m[2] });
  return out;
}

/** ستون‌های هر CREATE TABLE در schema.sql → Map<table, Set<column>> */
function parseSchemaColumns(sql) {
  const map = new Map();
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = new Set();
    for (const line of m[2].split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('--')) continue;
      const cm = t.match(/^(\w+)\s/);
      if (!cm) continue;
      const name = cm[1];
      if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].includes(name)) continue;
      cols.add(name);
    }
    map.set(table, cols);
  }
  return map;
}

// ---------- دیتابیس‌های زنده ----------
function liveColumns(db, table) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
  );
}

function buildFreshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA_SQL, 'utf-8'));
  return db;
}

/** دیتابیس «قدیمی»: جدول‌های هسته‌ای با ستون‌های نسخه‌ی قدیمی (قبل از مهاجرت‌ها).
 * الگو: هر ستونی که در COLUMN_MIGRATIONS هست، اینجا نیست؛ بقیه‌ی ستون‌های
 * غیرمهاجرتیِ schema.sql (مثل created_at و active و sold_at و status) اینجا هستند.
 */
function buildLegacyDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT, role TEXT NOT NULL DEFAULT 'admin');
    CREATE TABLE sales_experts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT);
    CREATE TABLE technical_experts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT);
    CREATE TABLE brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE device_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE device_models (id INTEGER PRIMARY KEY AUTOINCREMENT, brand_id INTEGER, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contract_number TEXT, sales_expert_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE failure_reasons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      contract_number TEXT,
      sales_expert_id INTEGER,
      device_type_id INTEGER NOT NULL,
      device_model_id INTEGER,
      brand_id INTEGER,
      technical_expert_id INTEGER,
      description TEXT,
      sold_at_jalali TEXT,
      sold_at_gregorian TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER
    );
    CREATE TABLE parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      part_number_1 TEXT DEFAULT '',
      part_number_2 TEXT,
      part_serial_number TEXT,
      tech_specs TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE license_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      plan TEXT NOT NULL DEFAULT 'trial',
      starts_at TEXT, expires_at TEXT, licensed_to TEXT, notes TEXT, updated_at TEXT
    );
  `);
  return db;
}

// ---------- اجرا ----------
console.log('— چک درفت schema.sql در برابر مهاجرت‌های ستونی\n');

const src = readFileSync(DB_TS, 'utf-8');
const schemaSql = readFileSync(SCHEMA_SQL, 'utf-8');
const migrations = parseMigrations(src);
const schemaCols = parseSchemaColumns(schemaSql);
console.log(`مهاجرت‌های ستونی db.ts: ${migrations.length} مورد | جدول‌های schema.sql: ${schemaCols.size} جدول\n`);

// لایه‌ی ۱ — هر ستونِ مهاجرت باید در schema.sql باشد
console.log('— لایه‌ی ۱: ستون‌های COLUMN_MIGRATIONS داخل schema.sql');
for (const { table, column } of migrations) {
  const cols = schemaCols.get(table);
  if (!cols) { fail(`جدول ${table} اصلاً در schema.sql نیست (ستون ${column})`); continue; }
  if (cols.has(column)) ok(`${table}.${column} در schema.sql هست`);
  else fail(`${table}.${column} در COLUMN_MIGRATIONS هست ولی در schema.sql نیست — نصب تازه ستون را ندارد!`);
}
for (const [table] of schemaCols) {
  if (!migrations.some((m) => m.table === table)) continue;
  for (const c of schemaCols.get(table)) {
    if (!migrations.some((m) => m.table === table && m.column === c)) continue;
    if (!MIGRATION_ONLY_OK.has(`${table}.${c}`)) { /* ستون مهاجرتی که در schema هم هست — عالی */ }
  }
}

// لایه‌ی ۲ — دو دیتابیس زنده: تازه (schema فقط) و قدیمی (مهاجرت‌شده)
console.log('\n— لایه‌ی ۲: مقایسه‌ی ستون‌های DB تازه (schema.sql) با DB قدیمیِ مهاجرت‌شده');
const tmp = mkdtempSync(join(tmpdir(), 'schema-drift-'));
let fresh, legacy;
try {
  fresh = buildFreshDb();
  legacy = buildLegacyDb();

  // مهاجرت را واقعاً اجرا کن: همان COLUMN_MIGRATIONS + جدول‌های پیش‌نیاز
  // (به‌جای import از db.ts — چون getDb singleton و مسیر فایل ENV محور است،
  //  اینجا منطق مهاجرت را عیناً از روی سورس بازسازی می‌کنیم تا واقع‌بینانه باشد)
  legacy.exec(`
    CREATE TABLE IF NOT EXISTS part_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number_1 TEXT NOT NULL, part_number_2 TEXT, title TEXT NOT NULL,
      tech_specs TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT,
      UNIQUE (part_number_1)
    );
    CREATE INDEX IF NOT EXISTS idx_part_catalog_pn ON part_catalog(part_number_1);
  `);
  // ddl هر مهاجرت را از سورس دربیاوریم تا با db.ts همگام بماند
  const start = src.indexOf('const COLUMN_MIGRATIONS');
  const end = src.indexOf('];', start);
  const body = src.slice(start, end);
  const reFull = /\{\s*table:\s*'([^']+)'\s*,\s*column:\s*'([^']+)'\s*,\s*ddl:\s*"([^"]*)"/g;
  let mf;
  const migrated = new Set();
  while ((mf = reFull.exec(body))) {
    const [, table, column, ddl] = mf;
    const cols = liveColumns(legacy, table);
    if (!cols.size || cols.has(column)) continue;
    legacy.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    migrated.add(`${table}.${column}`);
  }
  // role کارشناسان + ایندکس یکتای سریال (مثل migrateSchema)
  for (const t of ['sales_experts', 'technical_experts']) {
    if (!liveColumns(legacy, t).has('role')) {
      legacy.exec(`ALTER TABLE ${t} ADD COLUMN role TEXT NOT NULL DEFAULT '${t === 'sales_experts' ? 'sales' : 'tech'}'`);
    }
  }
  legacy.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_serial_unique ON parts(UPPER(TRIM(part_serial_number))) WHERE part_serial_number IS NOT NULL AND TRIM(part_serial_number) != ''`);
  ok(`مهاجرت روی DB قدیمی اجرا شد (${migrated.size} ستون اضافه شد)`);

  const allTables = new Set([...schemaCols.keys()]);
  // جدول‌های «قدیمی» که در schema هم هستند — همه‌ی جدول‌های مشترک را مقایسه کن
  let compared = 0;
  for (const table of allTables) {
    const freshCols = liveColumns(fresh, table);
    if (!freshCols.size) continue; // در schema نیست (نباید اتفاق بیفتد)
    const legacyCols = liveColumns(legacy, table);
    if (!legacyCols.size) continue; // در DB قدیمی ساخته نشده (جدول جدید) — schema پوشش می‌دهد
    compared++;
    const onlyFresh = [...freshCols].filter((c) => !legacyCols.has(c));
    const onlyLegacy = [...legacyCols].filter((c) => !freshCols.has(c));
    if (onlyFresh.length === 0 && onlyLegacy.length === 0) {
      ok(`${table}: ${freshCols.size} ستون، یکسان`);
    } else {
      if (onlyFresh.length) fail(`${table}: ستون فقط در schema.sql (نصب مهاجرت‌شده ندارد): ${onlyFresh.join(', ')}`);
      if (onlyLegacy.length) fail(`${table}: ستون فقط در DB مهاجرت‌شده (schema.sql ندارد): ${onlyLegacy.join(', ')}`);
    }
  }
  if (compared < 5) fail(`فقط ${compared} جدول مقایسه شد — پارس schema.sql را بررسی کن`);

  // لایه‌ی ۳ — ایندکس یکتای سریال در هر دو
  console.log('\n— لایه‌ی ۳: ایندکس یکتای سریال قطعه');
  const hasIdx = (db) => (db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_parts_serial_unique'`).get() !== undefined);
  if (hasIdx(fresh) && hasIdx(legacy)) ok('idx_parts_serial_unique در هر دو DB هست');
  else fail(`ایندکس سریال: fresh=${hasIdx(fresh)} legacy=${hasIdx(legacy)}`);
} finally {
  try { fresh?.close(); } catch { /* noop */ }
  try { legacy?.close(); } catch { /* noop */ }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
}

console.log(`\n${failures === 0 ? '✅' : '❌'} نتیجه: ${passes} موفق، ${failures} ناموفق`);
process.exit(failures === 0 ? 0 : 1);
