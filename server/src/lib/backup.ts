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
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { dbFilePath } from '../db/db.js';

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
  /** نتیجه‌ی push خودکار به مقصد خارجی (در صورت تنظیم BACKUP_PUSH_TARGET) */
  push?: PushResult;
}

// ============================================================
// Push خودکار بکاپ به مقصد خارجی — بعد از هر بکاپ موفق
// BACKUP_PUSH_TARGET یکی از دو حالت:
//   • مسیر پوشه (محلی یا UNC شبکه مثل \\server\share\backups) → کپی فایل
//   • s3://bucket/prefix → آپلود S3 (SigV4 بدون وابستگی خارجی؛ با S3_ENDPOINT سازگار با MinIO)
// AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_ENDPOINT
// ============================================================
export interface PushResult {
  ok: boolean;
  target: string;
  kind?: 'dir' | 's3';
  error?: string;
  durationMs?: number;
}

/** مقصد push فعلی (برای نمایش وضعیت) — خالی یعنی غیرفعال */
export function pushTarget(): string {
  return (process.env.BACKUP_PUSH_TARGET || '').trim();
}

/** آپلود یک فایل در S3 با امضای SigV4 — بدون aws-sdk */
async function s3PutObject(filePath: string, target: string): Promise<PushResult> {
  const started = Date.now();
  const m = /^s3:\/\/([^/]+)\/??(.*)$/.exec(target);
  if (!m) return { ok: false, target, kind: 's3', error: 'قالب BACKUP_PUSH_TARGET نامعتبر است (s3://bucket/prefix).', durationMs: Date.now() - started };
  const bucket = m[1];
  const prefix = m[2].replace(/\/+$/, '');
  const key = prefix ? `${prefix}/${basename(filePath)}` : basename(filePath);
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  if (!accessKey || !secretKey) {
    return { ok: false, target, kind: 's3', error: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY تنظیم نشده است.', durationMs: Date.now() - started };
  }
  try {
    const endpoint = (process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, '');
    const host = new URL(endpoint).host;
    const body = readFileSync(filePath);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    // path-style: /bucket/key — سازگار با MinIO و اکثر S3-سازگارها
    const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const res = await fetch(`${endpoint}${canonicalUri}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'Content-Length': String(body.length) },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const txt = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, target, kind: 's3', error: `S3 ${res.status}: ${txt}`, durationMs: Date.now() - started };
    }
    return { ok: true, target, kind: 's3', durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, target, kind: 's3', error: (e as Error).message, durationMs: Date.now() - started };
  }
}

/** کپی به پوشه‌ی خارجی (محلی/شبکه) */
function pushToDir(filePath: string, target: string): PushResult {
  const started = Date.now();
  try {
    if (!existsSync(target)) mkdirSync(target, { recursive: true });
    copyFileSync(filePath, join(target, basename(filePath)));
    return { ok: true, target, kind: 'dir', durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, target, kind: 'dir', error: (e as Error).message, durationMs: Date.now() - started };
  }
}

/** push بکاپ به مقصد خارجی — اگر مقصد تنظیم نشده باشد بدون عملیات موفق است */
export async function pushBackupFile(filePath: string): Promise<PushResult> {
  const target = pushTarget();
  if (!target) return { ok: true, target: '', kind: 'dir' };
  const r = target.toLowerCase().startsWith('s3://')
    ? await s3PutObject(filePath, target)
    : pushToDir(filePath, target);
  state.lastPush = { ...r, at: new Date().toISOString(), file: basename(filePath) };
  return r;
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

const state = {
  lastRun: null as string | null,
  lastResult: null as BackupResult | null,
  running: false,
  lastPush: null as (PushResult & { at: string; file: string }) | null,
};

/** آخرین وضعیت بکاپ (برای endpoint وضعیت) */
export function backupStatus(): {
  dir: string; keep: number; atHour: number; lastRun: string | null; lastResult: BackupResult | null; count: number;
  push: { target: string; enabled: boolean; last: (PushResult & { at: string; file: string }) | null };
} {
  const target = pushTarget();
  return { dir: backupDir(), keep: BACKUP_KEEP, atHour: BACKUP_AT, lastRun: state.lastRun, lastResult: state.lastResult, count: listBackups().length, push: { target, enabled: !!target, last: state.lastPush } };
}

/** اجرای بکاپ + ثبت وضعیت + push خارجی (با قفل ضدتداخل) */
export async function backupOnce(db: DatabaseSync): Promise<BackupResult> {
  if (state.running) return { ok: false, error: 'بکاپ قبلی هنوز در حال اجراست.' };
  state.running = true;
  try {
    const r = runBackup(db);
    state.lastRun = new Date().toISOString();
    state.lastResult = r;
    // push خارجی فقط بعد از بکاپ موفق — شکستش بکاپ محلی را باطل نمی‌کند
    if (r.ok && r.file) {
      r.push = await pushBackupFile(r.file);
      state.lastResult = r;
    }
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
    void backupOnce(db).then((r) => console.log(`🗄️ بکاپ اولیه: ${r.ok ? r.file : ('خطا: ' + r.error)}`));
  }
  setInterval(() => {
    (async () => {
      try {
        const now = new Date();
        if (hasRunToday()) return;
        if (now.getHours() < BACKUP_AT) return;
        const r = await backupOnce(db);
        if (r.ok) {
          console.log(`🗄️ بکاپ روزانه: ${r.file} (${Math.round((r.sizeBytes ?? 0) / 1024)}KB, نگهداری ${BACKUP_KEEP} نسخه)`);
          if (r.push && r.push.target && !r.push.ok) console.error(`🗄️ push خارجی ناموفق: ${r.push.error}`);
        } else console.error(`🗄️ بکاپ روزانه ناموفق: ${r.error}`);
      } catch (e) {
        console.error('خطای زمان‌بند بکاپ:', (e as Error).message);
      }
    })();
  }, 30 * 60 * 1000).unref(); // unref: در تست/دستورات کوتاه پروسه معلق نماند
}

// ============================================================
// بازیابی (restore) دو مرحله‌ای — از صفحه‌ی مدیریت بکاپ‌ها
//   ۱) prepare: اعتبارسنجی فایل بکاپ + بکاپ ایمنی از وضعیت فعلی + صدور توکن (۱۵ دقیقه)
//   ۲) confirm: جایگزینی فایل دیتابیس + ری‌استارت پروسه (کانتینر با unless-stopped بالا می‌آید)
// ============================================================
const RESTORE_TOKEN_TTL_MS = 15 * 60 * 1000;
const pendingRestores = new Map<string, { file: string; requestedAt: number; by: string }>();

export interface RestorePrepareResult {
  ok: boolean;
  token?: string;
  file?: string;
  safetyBackup?: string;
  error?: string;
}

/** مرحله‌ی ۱ — اعتبارسنجی + بکاپ ایمنی + صدور توکن یک‌بارمصرف */
export function prepareRestore(db: DatabaseSync, file: string, requestedBy: string): RestorePrepareResult {
  if (!/^support-backup-\d{8}-\d{6}\.db$/.test(file)) return { ok: false, error: 'نام فایل بکاپ نامعتبر است.' };
  const filePath = join(backupDir(), file);
  if (!existsSync(filePath)) return { ok: false, error: 'فایل بکاپ یافت نشد.' };
  // بررسی سلامت + وجود جداول حیاتی در فایل بکاپ
  try {
    const check = new DatabaseSync(filePath, { readOnly: true });
    const ic = (check.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check;
    const tbl = (check.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('devices','parts','users')`).get() as { c: number }).c;
    check.close();
    if (ic !== 'ok') return { ok: false, error: `فایل بکاپ ناسالم است (${ic}).` };
    if (tbl < 3) return { ok: false, error: 'ساختار فایل بکاپ معتبر نیست (جداول حیاتی پیدا نشد).' };
  } catch (e) {
    return { ok: false, error: `خواندن فایل بکاپ ناموفق بود: ${(e as Error).message}` };
  }
  // بکاپ ایمنی از وضعیت فعلی (بدون push — نتیجه‌ی restore نباید مقصد خارجی را آلوده کند)
  const safety = runBackup(db);
  if (!safety.ok) return { ok: false, error: `بکاپ ایمنی از وضعیت فعلی ناموفق بود: ${safety.error ?? '?'}` };
  const token = randomBytes(16).toString('hex');
  pendingRestores.set(token, { file, requestedAt: Date.now(), by: requestedBy });
  return { ok: true, token, file, safetyBackup: basename(safety.file!) };
}

/** نشانگر restore در انتظار ری‌استارت — در startup بعدی خوانده و پاک می‌شود */
export function restorePendingMarkerPath(): string {
  return join(dirname(dbFilePath()), 'restore-pending.json');
}

export interface RestoreConfirmResult {
  ok: boolean;
  file?: string;
  error?: string;
  restarting?: boolean;
}

/** مرحله‌ی ۲ — تأیید با توکن: جایگزینی فایل دیتابیس + خروج برنامه (ری‌استارت کانتینر) */
export function confirmRestore(db: DatabaseSync, token: string): RestoreConfirmResult {
  const p = pendingRestores.get(token);
  if (!p) return { ok: false, error: 'توکن تأیید نامعتبر است — بازیابی را دوباره آماده کنید.' };
  pendingRestores.delete(token);
  if (Date.now() - p.requestedAt > RESTORE_TOKEN_TTL_MS) {
    return { ok: false, error: 'درخواست بازیابی منقضی شده (بیش از ۱۵ دقیقه) — دوباره آماده کنید.' };
  }
  const src = join(backupDir(), p.file);
  if (!existsSync(src)) return { ok: false, error: 'فایل بکاپ بین مراحل حذف شده است.' };
  try {
    // چک‌پوینت WAL و بستن اتصال تا فایل اصلی قابل جایگزینی باشد
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    const dbPath = dbFilePath();
    copyFileSync(src, dbPath);
    writeFileSync(restorePendingMarkerPath(), JSON.stringify({ restoredFrom: p.file, at: new Date().toISOString(), by: p.by }));
    // خروج برنامه — در docker (restart: unless-stopped) کانتینر خودکار بالا می‌آید و دیتابیس بازیابی‌شده را باز می‌کند
    setTimeout(() => process.exit(50), 300);
    return { ok: true, file: p.file, restarting: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
