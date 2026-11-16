// ============================================================
// تست رمزنگاری بکاپ — AES-256-GCM با کلید ENV + مانیفست هش
// ------------------------------------------------------------
// • رمزگذاری/رمزگشایی رفت‌وبرگشتی و تشخیص دستکاری (tag)
// • کلید نامعتبر/غایب → خطای صریح، نه بکاپ بی‌سروصدا بدون رمز
// • بکاپ رمزشده: هدر SBK1 + مانیفست قابل اعتبارسنجی
// • بازیابی: تأیید مانیفست، رد فایل دستکاری‌شده، بازیابی بدون کلید ممنوع
// ============================================================
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  BACKUP_KEY_ENV,
  decryptBuffer,
  encryptBuffer,
  encryptionKey,
  encryptionStatus,
  isEncrypted,
  keyId,
  manifestPath,
  verifyBackupManifest,
} from '../src/lib/backupCrypto.js';
import { runBackup, prepareRestore, applyRetention } from '../src/lib/backup.js';

const HEX_KEY = 'a'.repeat(64);
let dir: string;
let db: DatabaseSync;

beforeAll(() => {
  process.env[BACKUP_KEY_ENV] = HEX_KEY;
});

afterAll(() => {
  delete process.env[BACKUP_KEY_ENV];
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sbk-'));
  // prepareRestore/verify مسیر بکاپ را از BACKUP_DIR می‌خوانند
  process.env.BACKUP_DIR = dir;
  db = new DatabaseSync(join(dir, 'app.db'));
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
    CREATE TABLE devices (id INTEGER PRIMARY KEY, main_serial TEXT);
    CREATE TABLE parts (id INTEGER PRIMARY KEY, title TEXT);
    INSERT INTO users (username) VALUES ('admin');
    INSERT INTO devices (main_serial) VALUES ('SN-1');
  `);
});

afterEach(() => {
  try { db.close(); } catch { /* noop */ }
  rmSync(dir, { recursive: true, force: true });
  delete process.env.BACKUP_DIR;
  process.env[BACKUP_KEY_ENV] = HEX_KEY;
});

describe('رمزنگاری بافر بکاپ', () => {
  it('رفت‌وبرگشت با کلید درست و هدر SBK1', () => {
    const key = encryptionKey()!;
    const plain = randomBytes(2048);
    const enc = encryptBuffer(plain, key);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.subarray(0, 4).toString('ascii')).toBe('SBK1');
    expect(enc.length).toBe(plain.length + 4 + 1 + 12 + 16);
    expect(decryptBuffer(enc, key).equals(plain)).toBe(true);
  });

  it('تغییر یک بایت → خطای احراز هویت', () => {
    const key = encryptionKey()!;
    const enc = encryptBuffer(Buffer.from('database-bytes'), key);
    enc[enc.length - 1] ^= 0xff;
    expect(() => decryptBuffer(enc, key)).toThrow(/دستکاری|رمزگشایی/);
  });

  it('کلید اشتباه → خطای احراز هویت', () => {
    const enc = encryptBuffer(Buffer.from('x'.repeat(100)), encryptionKey()!);
    expect(() => decryptBuffer(enc, randomBytes(32))).toThrow();
  });

  it('کلید نامعتبر/کوتاه → خطای صریح و وضعیت «غیرفعال با خطا»', () => {
    process.env[BACKUP_KEY_ENV] = 'too-short';
    expect(() => encryptionKey()).toThrow(/BACKUP_ENCRYPTION_KEY/);
    const st = encryptionStatus();
    expect(st.enabled).toBe(false);
    expect(st.error).toMatch(/BACKUP_ENCRYPTION_KEY/);
  });

  it('base64 ۳۲ بایتی هم پذیرفته می‌شود و keyId پایدار است', () => {
    const raw = randomBytes(32);
    process.env[BACKUP_KEY_ENV] = raw.toString('base64');
    const key = encryptionKey()!;
    expect(key.equals(raw)).toBe(true);
    expect(keyId(key)).toHaveLength(8);
    expect(encryptionStatus().keyId).toBe(keyId(raw));
  });
});

describe('بکاپ رمزشده + مانیفست', () => {
  it('فایل بکاپ با کلید رمز می‌شود و مانیفست هش معتبر دارد', () => {
    const r = runBackup(db, dir);
    expect(r.ok).toBe(true);
    expect(r.encrypted).toBe(true);

    const file = r.file!;
    const onDisk = readFileSync(file);
    expect(isEncrypted(onDisk)).toBe(true);
    // متن دیتابیس نباید در فایل رمزشده قابل مشاهده باشد
    expect(onDisk.includes(Buffer.from('SQLite format 3'))).toBe(false);

    const check = verifyBackupManifest(dir, file);
    expect(check.ok).toBe(true);
    expect(check.manifest!.format).toBe('SBK1');
    expect(check.manifest!.algorithm).toBe('AES-256-GCM');
    expect(check.manifest!.keyId).toBe(keyId(encryptionKey()!));
    expect(check.manifest!.fileSha256).toHaveLength(64);
    expect(check.manifest!.plaintextSha256).toHaveLength(64);
  });

  it('دستکاری فایل رمزشده → مانیفست نامطابق', () => {
    const r = runBackup(db, dir);
    const file = r.file!;
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] ^= 0x01;
    writeFileSync(file, bytes);
    const check = verifyBackupManifest(dir, file);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/هش|اندازه/);
  });

  it('بدون کلید: بکاپ بدون رمز ولی با مانیفست plain', () => {
    delete process.env[BACKUP_KEY_ENV];
    const r = runBackup(db, dir);
    expect(r.ok).toBe(true);
    expect(r.encrypted).toBe(false);
    expect(isEncrypted(readFileSync(r.file!))).toBe(false);
    const check = verifyBackupManifest(dir, r.file!);
    expect(check.ok).toBe(true);
    expect(check.manifest!.format).toBe('plain');
  });

  it('نگهداری، مانیفست بکاپ‌های حذف‌شده را هم پاک می‌کند', () => {
    const r = runBackup(db, dir);
    const manifest = manifestPath(dir, r.file!);
    expect(existsSync(manifest)).toBe(true);
    const deleted = applyRetention(dir, 0);
    expect(deleted.length).toBe(1);
    expect(existsSync(manifest)).toBe(false);
    expect(existsSync(r.file!)).toBe(false);
  });
});

describe('بازیابی بکاپ رمزشده', () => {
  it('بکاپ رمزشده آماده‌ی بازیابی می‌شود (رمزگشایی + جداول حیاتی)', () => {
    const r = runBackup(db, dir);
    expect(r.ok).toBe(true);
    const prep = prepareRestore(db, basename(r.file!), 'u1');
    expect(prep.ok).toBe(true);
    expect(prep.token).toBeTruthy();
  });

  it('بدون کلید، بازیابی بکاپ رمزشده رد می‌شود', () => {
    const r = runBackup(db, dir);
    delete process.env[BACKUP_KEY_ENV];
    const prep = prepareRestore(db, basename(r.file!), 'u1');
    expect(prep.ok).toBe(false);
    expect(prep.error).toMatch(/BACKUP_ENCRYPTION_KEY/);
  });

  it('کلید اشتباه → بازیابی رد می‌شود', () => {
    const r = runBackup(db, dir);
    process.env[BACKUP_KEY_ENV] = 'b'.repeat(64);
    const prep = prepareRestore(db, basename(r.file!), 'u1');
    expect(prep.ok).toBe(false);
    expect(prep.error).toMatch(/رمزگشایی/);
  });

  it('فایل دستکاری‌شده → بازیابی رد می‌شود', () => {
    const r = runBackup(db, dir);
    const bytes = readFileSync(r.file!);
    bytes[bytes.length - 5] ^= 0x7f;
    writeFileSync(r.file!, bytes);
    const prep = prepareRestore(db, basename(r.file!), 'u1');
    expect(prep.ok).toBe(false);
    expect(prep.error).toMatch(/مانیفست|هش|معتبر/);
  });
});
