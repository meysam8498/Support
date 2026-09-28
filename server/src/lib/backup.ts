// ============================================================
// پشتیبان‌گیری خودکار دیتابیس SQLite
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// • اسنپ‌شات سازگار با WAL با `VACUUM INTO` — فایل خروجی یک دیتابیس کامل و
//   فشرده‌شده است (نه کپی خام حین نوشتن)، پس همیشه قابل بازیابی است.
// • پس از هر بکاپ، integrity_check اجرا و در متادیتا ثبت می‌شود.
// • نگهداری: حداکثر BACKUP_KEEP نسخه (پیش‌فرض ۳۰) — قدیمی‌ترین‌ها حذف می‌شوند.
// • زمان‌بندی: روزانه در ساعت BACKUP_AT (پیش‌فرض 03:30 به وقت Tehran)
//   با setInterval نیم‌ساعته — بدون وابستگی خارجی (cron نه node-cron).
// ============================================================
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** نام فایل بکاپ: support-backup-YYYYMMDD-HHMMSS.db */
export function backupFileName(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `support-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.db`;
}

/** شاخه‌ی بکاپ‌ها — قابل تنظیم با BACKUP_DIR (در کانتینر: /app/server/backups) */
export function backupDir(): string {
  const fromEnv = process.env.BACKUP_DIR;
  if (fromEnv) return fromEnv;
  // پیش‌فرض: کنار دیتابیس (پوشه‌ی data) — همان قاعده‌ی resolveDbPath در db.ts
  const dbPath = process.env.DB_PATH
    ? resolve(process.cwd(), process.env.DB_PATH)
    : join(fileURLToPath(new URL('../../data/app.db', import.meta.url)));
  return join(dirname(dbPath), 'backups');
}

export interface BackupResult {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  integrity?: string;
  deletedOld?: string[];
  error?: string;
  durationMs?: number;
}

/** اجرای یک بکاپ کامل + بررسی سلامت + اعمال سیاست نگهداری */
export function runBackup(db: DatabaseSync, dir: string = backupDir()): BackupResult {
  const started = Date.now();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, backupFileName());
    // VACUUM INTO: یک اسنپ‌شات یکپارچه حتی در حین تراکنش‌های فعال (WAL-safe)
    db.prepare(`VACUUM INTO ?`).run(file);
    if (!existsSync(file)) return { ok: false, error: 'فایل بکاپ ساخته نشد.' };
    const sizeBytes = statSync(file).size;

    // بررسی سلامت روی یک اتصال فقط‌خواندنیِ جدا (بدون لمس اتصال اصلی)
    let integrity = 'unknown';
    try {
      const check = new DatabaseSync(file, { readOnly: true });
      const row = check.prepare(`PRAGMA integrity_check`).get() as { integrity_check?: string } | undefined;
      integrity = row?.integrity_check ?? 'unknown';
      check.close();
    } catch { /* بررسی سلامت شکست خورد ولی فایل موجود است */ }

    // فایل ناسالم/خالی حذف می‌شود تا در فهرست بکاپ‌های «سالم» نیاید
    if (integrity !== 'ok' || sizeBytes < 4096) {
      try { unlinkSync(file); } catch { /* noop */ }
      return { ok: false, error: `بکاپ ناسالم بود (${integrity}, ${sizeBytes} بایت) و حذف شد.`, durationMs: Date.now() - started };
    }

    const deletedOld = applyRetention(dir);
    return { ok: true, file, sizeBytes, integrity, deletedOld, durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, error: (e as Error).message, durationMs: Date.now() - started };
  }
}

/** حذف قدیمی‌ترین بکاپ‌ها بیش از سقف نگهداری — خروجی: نام فایل‌های حذف‌شده */
export function applyRetention(dir: string, keep: number = BACKUP_KEEP): string[] {
  const deleted: string[] = [];
  try {
    if (!existsSync(dir)) return deleted;
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('support-backup-') && f.endsWith('.db'))
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m); // جدید → قدیمی
    for (const x of files.slice(keep)) {
      try { unlinkSync(join(dir, x.f)); deleted.push(x.f); } catch { /* noop */ }
    }
  } catch { /* noop */ }
  return deleted;
}

/** فهرست بکاپ‌های موجود — جدید → قدیمی */
export interface BackupInfo {
  file: string;
  sizeBytes: number;
  mtime: string;
}
export function listBackups(dir: string = backupDir()): BackupInfo[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.startsWith('support-backup-') && f.endsWith('.db'))
      .map((f) => {
        const st = statSync(join(dir, f));
        return { file: f, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  } catch {
    return [];
  }
}

/** سقف نگهداری — قابل تنظیم با BACKUP_KEEP */
export const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);

/** ساعت اجرای روزانه (00-23) — قابل تنظیم با BACKUP_AT (پیش‌فرض 3:30) */
export const BACKUP_AT = (() => {
  const v = Number(process.env.BACKUP_AT);
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : 3;
})();

const state = { lastRun: null as string | null, lastResult: null as BackupResult | null, running: false };

/** آخرین وضعیت بکاپ (برای endpoint وضعیت) */
export function backupStatus(): { dir: string; keep: number; atHour: number; lastRun: string | null; lastResult: BackupResult | null; count: number } {
  return { dir: backupDir(), keep: BACKUP_KEEP, atHour: BACKUP_AT, lastRun: state.lastRun, lastResult: state.lastResult, count: listBackups().length };
}

/** اجرای بکاپ + ثبت وضعیت (با قفل ضدتداخل) */
export function backupOnce(db: DatabaseSync): BackupResult {
  if (state.running) return { ok: false, error: 'بکاپ قبلی هنوز در حال اجراست.' };
  state.running = true;
  try {
    const r = runBackup(db);
    state.lastRun = new Date().toISOString();
    state.lastResult = r;
    return r;
  } finally {
    state.running = false;
  }
}

/** آیا امروز (به وقت ساعت سرور) بکاپ روزانه گرفته شده؟ */
function hasRunToday(): boolean {
  if (!state.lastRun) return false;
  const d = new Date(state.lastRun);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** حلقه‌ی زمان‌بند — هر ۳۰ دقیقه چک می‌کند؛ در اولین گذر از ساعت BACKUP_AT امروز بکاپ می‌گیرد */
export function startBackupScheduler(db: DatabaseSync): void {
  // بکاپ راه‌اندازی: اگر هیچ بکاپی نیست، بلافاصله یکی بگیر
  if (listBackups().length === 0) {
    const r = backupOnce(db);
    console.log(`🗄️ بکاپ اولیه: ${r.ok ? r.file : ('خطا: ' + r.error)}`);
  }
  setInterval(() => {
    try {
      const now = new Date();
      if (hasRunToday()) return;
      if (now.getHours() < BACKUP_AT) return;
      const r = backupOnce(db);
      if (r.ok) console.log(`🗄️ بکاپ روزانه: ${r.file} (${Math.round((r.sizeBytes ?? 0) / 1024)}KB, نگهداری ${BACKUP_KEEP} نسخه)`);
      else console.error(`🗄️ بکاپ روزانه ناموفق: ${r.error}`);
    } catch (e) {
      console.error('خطای زمان‌بند بکاپ:', (e as Error).message);
    }
  }, 30 * 60 * 1000).unref(); // unref: در تست/دستورات کوتاه پروسه معلق نماند
}
