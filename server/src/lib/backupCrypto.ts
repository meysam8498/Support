// ============================================================
// رمزنگاری بکاپ — AES-256-GCM با کلید ENV + مانیفست هش
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// • کلید: BACKUP_ENCRYPTION_KEY (۳۲ بایت hex/base64) یا مسیر فایلش در
//   BACKUP_ENCRYPTION_KEY_FILE (برای docker secret و سوآرم). مقدار ENV مقدم است.
//   کلید فقط در ENV/secret می‌ماند؛ هرگز در لاگ یا بکاپ نوشته نمی‌شود.
// • قالب فایل: «SBK1» | نسخه (۱ بایت) | nonce (۱۲ بایت) | tag (۱۶ بایت) | ciphertext
//   (کلمه‌ی SBK1 + نسخه به‌عنوان AAD به رمز بسته می‌شوند تا هدر قابل دستکاری نباشد)
// • مانیفست: کنار هر بکاپ یک فایل `<file>.manifest.json` با sha256 فایل رمزشده،
//   sha256 متن اصلی، keyId (اثر انگشت کوتاه کلید) و متادیتای بازیابی.
// • بکاپ‌های قدیمیِ بدون هدر SBK1 با احتیاط «رمزنشده» تشخیص داده می‌شوند.
// ============================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** کلید به‌صورت مقدار مستقیم در ENV */
export const BACKUP_KEY_ENV = 'BACKUP_ENCRYPTION_KEY';
/** مسیر فایل کلید — برای docker secret / docker swarm secret */
export const BACKUP_KEY_FILE_ENV = 'BACKUP_ENCRYPTION_KEY_FILE';
/** امضای فایل رمزشده */
export const MAGIC = Buffer.from('SBK1', 'ascii');
/** نسخه‌ی قالب — با کلید/الگوریتم عوض شدنی بدون ابهام */
export const FORMAT_VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;

export interface EncryptionStatus {
  enabled: boolean;
  keyId?: string;
  /** کلید از کجا آمد — برای تشخیص سریع در لاگ/پشتیبانی */
  source?: 'env' | 'file';
  error?: string;
}

/** اعتبارسنجی متن کلید؛ `origin` فقط برای پیام خطا (هیچ‌وقت خود کلید) */
function parseKey(raw: string, origin: string): Buffer {
  const hex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  if (hex) return hex;
  // base64 استاندارد (با یا بدون padding) — باید دقیقاً ۳۲ بایت بدهد
  const b64 = /^[A-Za-z0-9+/_-]+={0,2}$/.test(raw) ? Buffer.from(raw, 'base64') : null;
  if (b64 && b64.length === 32) return b64;
  throw new Error(`${origin} نامعتبر است — باید ۳۲ بایت (۶۴ نویسه‌ی hex یا base64) باشد.`);
}

/** خواندن متن کلید از فایل secret — خطاهای فایل هم صریح و بدون افشای محتوا */
function keyFromFile(file: string): string {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(
      `${BACKUP_KEY_FILE_ENV}: فایل کلید «${file}» خوانده نشد (${(e as Error).message}).`,
    );
  }
  // docker secret معمولاً با \n پایانی نوشته می‌شود
  const trimmed = content.trim();
  if (!trimmed) throw new Error(`${BACKUP_KEY_FILE_ENV}: فایل کلید «${file}» خالی است.`);
  return trimmed;
}

/** منبع فعال کلید: مقدار ENV اولویت دارد، بعد فایل — null = تنظیم نشده */
export function encryptionKeySource(): 'env' | 'file' | null {
  if ((process.env[BACKUP_KEY_ENV] || '').trim()) return 'env';
  if ((process.env[BACKUP_KEY_FILE_ENV] || '').trim()) return 'file';
  return null;
}

/**
 * خواندن و اعتبارسنجی کلید از ENV یا فایل secret.
 * null = رمزنگاری غیرفعال (کلید تنظیم نشده). کلید/فایل نامعتبر → خطای صریح
 * (بکاپ نباید بی‌سروصدا بدون رمز ساخته شود).
 */
export function encryptionKey(): Buffer | null {
  const inline = (process.env[BACKUP_KEY_ENV] || '').trim();
  if (inline) return parseKey(inline, BACKUP_KEY_ENV);

  const file = (process.env[BACKUP_KEY_FILE_ENV] || '').trim();
  if (!file) return null;
  return parseKey(keyFromFile(file), `${BACKUP_KEY_FILE_ENV} (${file})`);
}

/** وضعیت رمزنگاری برای نمایش در API/لاگ — بدون افشای کلید */
export function encryptionStatus(): EncryptionStatus {
  const source = encryptionKeySource();
  try {
    const key = encryptionKey();
    return key ? { enabled: true, keyId: keyId(key), source: source ?? undefined } : { enabled: false };
  } catch (e) {
    return { enabled: false, source: source ?? undefined, error: (e as Error).message };
  }
}

/** اثر انگشت کوتاه کلید (۸ نویسه) — برای مانیفست و چرخش کلید */
export function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

/** آیا این بافر بکاپ رمزشده است؟ */
export function isEncrypted(buf: Buffer): boolean {
  return buf.length > MAGIC.length + 1 && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** رمزگذاری بافر بکاپ — خروجی قالب SBK1 */
export function encryptBuffer(plain: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION])]));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), nonce, cipher.getAuthTag(), body]);
}

/** رمزگشایی بافر بکاپ — خطای احراز هویت = فایل دستکاری‌شده یا کلید اشتباه */
export function decryptBuffer(enc: Buffer, key: Buffer): Buffer {
  if (!isEncrypted(enc)) throw new Error('فایل بکاپ رمزشده نیست (هدر SBK1 ندارد).');
  const version = enc[MAGIC.length];
  if (version !== FORMAT_VERSION) throw new Error(`نسخه‌ی قالب بکاپ پشتیبانی نمی‌شود (${version}).`);
  const start = MAGIC.length + 1;
  const nonce = enc.subarray(start, start + NONCE_LEN);
  const tag = enc.subarray(start + NONCE_LEN, start + NONCE_LEN + TAG_LEN);
  const body = enc.subarray(start + NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION])]));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error('رمزگشایی بکاپ ناموفق بود — کلید اشتباه است یا فایل دستکاری شده.');
  }
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** مانیفست هر بکاپ — هش‌ها مبنای تشخیص دستکاری هنگام بازیابی‌اند */
export interface BackupManifest {
  version: number;
  file: string;
  format: 'SBK1' | 'plain';
  algorithm: 'AES-256-GCM' | 'none';
  keyId?: string;
  createdAt: string;
  /** اندازه‌ی فایل روی دیسک (رمزشده) */
  sizeBytes: number;
  /** sha256 بایت‌های روی دیسک */
  fileSha256: string;
  /** sha256 متن اصلی (دیتابیس اسنپ‌شات) */
  plaintextSha256: string;
  integrity: string;
  /** sha256 همین مانیفست — برای تشخیص ویرایش مانیفست */
  digest: string;
}

export function manifestPath(dir: string, file: string): string {
  // file می‌تواند مسیر کامل باشد — نام پایه کافی است
  return join(dir, `${basename(file)}.manifest.json`);
}

/** ساخت مانیفست + نوشتن فایل کنار بکاپ */
export function writeBackupManifest(
  dir: string,
  file: string,
  info: { encrypted: boolean; keyId?: string; onDisk: Buffer; plaintext: Buffer; integrity: string; createdAt?: string },
): BackupManifest {
  const body = {
    version: 1,
    file: basename(file),
    format: info.encrypted ? ('SBK1' as const) : ('plain' as const),
    algorithm: info.encrypted ? ('AES-256-GCM' as const) : ('none' as const),
    keyId: info.keyId,
    createdAt: info.createdAt ?? new Date().toISOString(),
    sizeBytes: info.onDisk.length,
    fileSha256: sha256(info.onDisk),
    plaintextSha256: sha256(info.plaintext),
    integrity: info.integrity,
  };
  const manifest: BackupManifest = { ...body, digest: sha256(Buffer.from(JSON.stringify(body))) };
  writeFileSync(manifestPath(dir, file), JSON.stringify(manifest, null, 2));
  return manifest;
}

export interface ManifestCheck {
  ok: boolean;
  manifest?: BackupManifest;
  error?: string;
}

/**
 * بررسی مانیفست یک بکاپ: هش خود مانیفست، هش فایل روی دیسک و سازگاری اندازه.
 * نبودِ مانیفست «خطا» نیست (بکاپ‌های قدیمی) ولی ok=false با error مشخص می‌دهد.
 */
export function verifyBackupManifest(dir: string, file: string): ManifestCheck {
  const path = manifestPath(dir, file);
  if (!existsSync(path)) return { ok: false, error: 'مانیفست این بکاپ وجود ندارد (بکاپ قدیمی).' };
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8')) as BackupManifest;
  } catch (e) {
    return { ok: false, error: `مانیفست خوانده نشد: ${(e as Error).message}` };
  }
  const { digest, ...body } = manifest;
  if (digest !== sha256(Buffer.from(JSON.stringify(body)))) {
    return { ok: false, manifest, error: 'مانیفست دستکاری شده است (هش مانیفست مطابقت ندارد).' };
  }
  const filePath = join(dir, basename(file));
  if (!existsSync(filePath)) return { ok: false, manifest, error: 'فایل بکاپ وجود ندارد.' };
  const onDisk = readFileSync(filePath);
  if (onDisk.length !== manifest.sizeBytes) {
    return { ok: false, manifest, error: `اندازه‌ی فایل با مانیفست نمی‌خواند (${onDisk.length} ≠ ${manifest.sizeBytes}).` };
  }
  if (sha256(onDisk) !== manifest.fileSha256) {
    return { ok: false, manifest, error: 'هش فایل با مانیفست مطابقت ندارد (دستکاری یا خرابی).' };
  }
  return { ok: true, manifest };
}

/**
 * حذف فایل بکاپ و مانیفستش (نگهداری/پاک‌سازی).
 * true = فایل بکاپ واقعاً حذف شد (برای گزارش دقیق فایل‌های حذف‌شده).
 */
export function deleteBackupFiles(dir: string, file: string): boolean {
  let deleted = false;
  try { unlinkSync(join(dir, basename(file))); deleted = true; } catch { /* noop */ }
  try { unlinkSync(manifestPath(dir, file)); } catch { /* noop */ }
  return deleted;
}
