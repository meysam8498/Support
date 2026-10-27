// ============================================================
// چرخش کلید امضای لایسنس — نسخه‌ی درون‌سروری برای اندپوینت ادمین (۱.۲۹)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// همان منطق scripts/make-license-code.mjs --rotate-keys ولی بدون SSH:
//   ۱) کلید عمومی جاری → keys/accepted_license_public_keys/license_public_<kid>.pem
//   ۲) کلید خصوصی جاری → keys/license_private_<kid>.pem (بایگانی)
//   ۳) جفت‌کلید جدید RS256 2048-bit تولید و جایگزین:
//        keys/license_public.pem   (عمومی جدید — صدور آینده)
//        keys/license_private.pem  (خصوصی جدید — صدور آینده)
//   ۴) ثبت در رجیستری keys/rotations.jsonl
//   ۵) نوسازی حافظه‌ی ماژول licenseCode (کش ACCEPTED_KEYS/CURRENT_PEM) —
//      بدون ری‌استارت سرور؛ کدهای صادرشده با کلید قبلی تا پایان exp معتبر می‌مانند
//      (تأیید چندکلیدی با kid).
// اجبارها:
//   • کلید خصوصی صدور فقط از فایل keys/license_private.pem (یا ENV LICENSE_ISSUE_KEY
//     میسر فایل) می‌آید — اگر کلید خصوصی ENVی ناشناس/غیرفایلی باشد، چرخش سمت سرور
//     انجام نمی‌شود (چون archivos‌کردن محلی آن بی‌فایده است) و خطای راهنمادار می‌دهد.
//   • عملیات اتمی در حد ممکن: ابتدا همه‌چیز محاسبه، بعد نوشتن فایل‌ها؛
//     خطای نیمه‌کاره با پرچم rollback در پاسخ گزارش می‌شود.
// ============================================================
import { generateKeyPairSync, createHash, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicKid, reloadAcceptedKeys } from './licenseCode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * پوشه‌ی keys — به‌ترتیب:
 *   ۱) ENV LICENSE_KEYS_DIR (مسیر صریح — تست و نصب‌های سفارشی)
 *   ۲) keys/ کنار CWD (اجرای خدمت/داکر در ریشه‌ی نصب)
 *   ۳) keys/ ریشه‌ی پروژه (نسبت به این ماژول — از src و dist یکسان)
 */
export function keysDir(): string {
  const fromEnv = process.env.LICENSE_KEYS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const here = join(__dirname, '..', '..', '..', 'keys');
  return existsSync(join(process.cwd(), 'keys')) ? join(process.cwd(), 'keys') : here;
}

export interface KeyRotationResult {
  ok: boolean;
  old_kid: string;
  new_kid: string;
  accepted_kids: string[];
  current_kid: string;
  archived_pub_path: string;
  registry_path: string;
  rotated_at: string;
}

export class KeyRotationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'KeyRotationError';
  }
}

/** وضعیت فعلی کلیدها برای GET (بدون انجام هیچ عملیاتی) */
export function keyStatus(): {
  current_kid: string;
  accepted_kids: string[];
  accepted_count: number;
  has_issue_key: boolean;
  keys_dir: string;
} {
  const dir = keysDir();
  const kids = acceptedKids(); // شامل kid جاری — یک‌بار محاسبه برای هر دو فیلد
  return {
    current_kid: currentKid(),
    accepted_kids: kids,
    accepted_count: kids.length,
    has_issue_key: existsSync(join(dir, 'license_private.pem')),
    keys_dir: dir,
  };
}

// پیاده‌سازی بدون وابستگی به سرویس‌الداری داخلی licenseCode — خواندن جاری/پذیرفته‌شده‌ها از خود ماژول
function currentKid(): string {
  const pem = readCurrentPublicPem();
  return publicKid(pem);
}

function acceptedKids(): string[] {
  const list: string[] = [];
  const dir = keysDir();
  try {
    for (const f of readdirSafe(join(dir, 'accepted_license_public_keys'))) {
      if (f === 'license_public.pem') continue;
      const kid = /license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1];
      if (kid) list.push(kid);
    }
  } catch { /* پوشه نیست */ }
  try {
    for (const f of readdirSafe(dir)) {
      if (f === 'license_public.pem') continue;
      const kid = /license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1];
      if (kid) list.push(kid);
    }
  } catch { /* */ }
  return [...new Set([...list, currentKid()])];
}

function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

function readCurrentPublicPem(): string {
  const dir = keysDir();
  for (const p of [join(dir, 'license_public.pem'), join(dir, 'license_public_key.pem')]) {
    try { return readFileSync(p, 'utf8'); } catch { /* بعدی */ }
  }
  // آخرین گزینه — همان منطق licenseCode (فایل کنار سورس داخل build)
  try { return readFileSync(join(__dirname, 'license_public_key.pem'), 'utf8'); } catch { /* */ }
  throw new KeyRotationError('کلید عمومی جاری یافت نشد (keys/license_public.pem).', 503);
}

/**
 * چرخش کلید امضا — از داخل سرور، بدون SSH.
 * پس از موفقیت، حافظه‌ی تأیید ماژول licenseCode نوسازی می‌شود (reloadAcceptedKeys)
 * و کد جدید باید بلافاصله با kid جدید صادر شود — صدور با کلید خصوصی تازه.
 */
export function rotateSigningKeys(): KeyRotationResult {
  const dir = keysDir();
  const pubPath = join(dir, 'license_public.pem');
  const privPath = join(dir, 'license_private.pem');

  if (!existsSync(privPath) || !existsSync(pubPath)) {
    throw new KeyRotationError(
      'برای چرخش، جفت‌کلید فعلی باید روی دیسک موجود باشد: keys/license_private.pem و keys/license_public.pem (اگر کلید با ENV تحویل شده، چرخش سمت سرور میسر نیست — چرخش را در سرورِ مالکِ کلید با make-license-code.mjs انجام دهید).',
      409
    );
  }

  const oldPub = readFileSync(pubPath, 'utf8');
  const oldPriv = readFileSync(privPath, 'utf8');
  const oldKid = publicKid(oldPub);

  // ۱) بایگانی عمومی قدیمی (پذیرفته‌شده) و خصوصی قدیمی (بایگانی محلی)
  const acceptedDir = join(dir, 'accepted_license_public_keys');
  mkdirSync(acceptedDir, { recursive: true });
  const archivedPub = join(acceptedDir, `license_public_${oldKid}.pem`);
  const archivedPriv = join(dir, `license_private_${oldKid}.pem`);

  // ۲) جفت‌کلید جدید
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const newKid = publicKid(String(publicKey));

  // ۳) نوشتن — به ترتیب اهمیت: اول بایگانی عمودی قدیمی، بعد کلیدهای جدید
  renameSync(pubPath, archivedPub);
  writeFileSync(archivedPriv, oldPriv);
  writeFileSync(pubPath, String(publicKey));
  writeFileSync(privPath, String(privateKey));

  // ۴) رجیستری چرخش
  const registry = join(dir, 'rotations.jsonl');
  const rotatedAt = new Date().toISOString();
  try {
    appendFileSync(registry, JSON.stringify({ rotated_at: rotatedAt, old_kid: oldKid, new_kid: newKid, archived_pub: archivedPub, by: 'admin-panel' }) + '\n', 'utf8');
  } catch (e) {
    console.error('⚠ ثبت رجیستری چرخش ناموفق:', (e as Error).message);
  }

  // ۵) نوسازی حافظه‌ی تأیید چندکلیدی (بدون ری‌استارت) — کدهای قبلی معتبر می‌مانند
  const info = reloadAcceptedKeys();

  return {
    ok: true,
    old_kid: oldKid,
    new_kid: newKid,
    accepted_kids: info.accepted_kids,
    current_kid: info.current_kid,
    archived_pub_path: archivedPub,
    registry_path: registry,
    rotated_at: rotatedAt,
  };
}

// ============================================================
// تاریخچه چرخش‌ها — خواندن رجیستری keys/rotations.jsonl (فقط‌خواندنی)
// برای اندپوینت GET /api/license/keys/rotations (پنل ادمین):
//   • سطرهای فایل از آخرین به اولین (جدیدترین اول)
//   • هر سطر: فیلدهای خام رجیستری + وضعیت بایگانی عمومی روی همین سرور
//     (مسیر archived_pub ممکن است مسیر مطلق ماشین صادرکننده باشد —
//      به‌نامِ kid در keys/accepted_license_public_keys/ هم جست‌وجو می‌شود)
//   • فایل ناموجود → لیست خالی (خطا نیست)؛ سطرهای خراب گزارش می‌شوند نه حذف بی‌صدا
// ============================================================
export interface RotationHistoryEntry {
  /** زمان چرخش (ISO از رجیستری) — اگر نامعتبر بود همان مقدار خام */
  rotated_at: string;
  old_kid: string;
  new_kid: string;
  /** مسیر بایگانی عمومی قدیمی که روی همین سرور پیدا شد (یا مسیر ثبت‌شده در رجیستری) */
  archived_pub: string | null;
  /** فایل بایگانی عمومی قدیمی همین‌جا موجود است؟ */
  archive_ok: boolean;
  /** چه کسی چرخش را انجام داد (پنل ادمین / CLI) — در رجیستری‌های قدیمی نیست */
  by?: string;
  /** ردیفِ بازیابی (POST keys/restore) به‌جای چرخش جدید؟ */
  restored?: boolean;
}

export interface RotationHistory {
  /** مسیر کامل رجیستری روی همین سرور */
  path: string;
  exists: boolean;
  /** تعداد سطرهای معتبر */
  count: number;
  /** تعداد سطرهای قابل‌تحلیل ولی ناقص/خراب (فقط‌گزارش — بدون حذف) */
  invalid_lines: number;
  /** kid کلید جاری (null اگر کلید عمومی جاری خوانده نشود) */
  current_kid: string | null;
  /** جدیدترین چرخش اول */
  rotations: RotationHistoryEntry[];
}

export function rotationHistory(): RotationHistory {
  const dir = keysDir();
  const registry = join(dir, 'rotations.jsonl');
  const empty = (exists: boolean, invalid = 0): RotationHistory => {
    let current: string | null = null;
    try { current = currentKid(); } catch { /* کلید جاری نیست — تاریخچه همچنان قابل نمایش است */ }
    return { path: registry, exists, count: 0, invalid_lines: invalid, current_kid: current, rotations: [] };
  };
  if (!existsSync(registry)) return empty(false);

  const raw = readFileSync(registry, 'utf8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const rotations: RotationHistoryEntry[] = [];
  let invalid = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as { rotated_at?: unknown; old_kid?: unknown; new_kid?: unknown; archived_pub?: unknown; by?: unknown; restored?: unknown };
      if (typeof e.old_kid !== 'string' || !/^[0-9a-f]{8}$/.test(e.old_kid)
        || typeof e.new_kid !== 'string' || !/^[0-9a-f]{8}$/.test(e.new_kid)) {
        invalid++;
        continue;
      }
      const archived = typeof e.archived_pub === 'string' && e.archived_pub ? e.archived_pub : null;
      // جست‌وجوی بایگانی عمومی: مسیر ثبت‌شده (ممکن است متعلق به ماشین دیگری باشد) → نام kid در پوشه‌ی بایگانی
      const candidates = [
        archived,
        join(dir, 'accepted_license_public_keys', `license_public_${e.old_kid}.pem`),
        join(dir, `license_public_${e.old_kid}.pem`),
      ].filter((p): p is string => !!p);
      const resolved = candidates.find((p) => existsSync(p)) ?? null;
      rotations.push({
        rotated_at: typeof e.rotated_at === 'string' ? e.rotated_at : '',
        old_kid: e.old_kid,
        new_kid: e.new_kid,
        archived_pub: resolved ?? archived,
        archive_ok: !!resolved,
        ...(typeof e.by === 'string' && e.by ? { by: e.by } : {}),
        ...(e.restored === true ? { restored: true } : {}),
      });
    } catch {
      invalid++;
    }
  }
  rotations.reverse(); // جدیدترین اول
  return { path: registry, exists: true, count: rotations.length, invalid_lines: invalid, current_kid: (() => { try { return currentKid(); } catch { return null; } })(), rotations };
}

// ============================================================
// تأیید و بازیابی کلید قبلی از رجیستری/بایگانی — اندپوینت‌های ادمین
//   • GET  keys/rotations/:kid/verify → سلامت جفت‌کلید بایگانی‌شده‌ی آن kid
//     (فایل موجود؟ kid محاسبه‌شده برابر است؟ کلید خصوصی با عمومی تطابق دارد؟
//      در رجیستری ثبت شده؟) — فقط‌خواندنی، هیچ فایلی را تغییر نمی‌دهد.
//   • POST keys/restore { kid } → جایگزینی کلیدهای جاری با جفت‌کلید بایگانی‌شده
//     (برگرداندن چرخش). اصول:
//       - فقط با جفت‌کلید کامل (عمومی+خصوصی) — نیمه‌کاره صدور و تأیید را می‌شکند
//       - کلیدهای جاری اول بایگانی می‌شوند (هیچ‌چیز از دست نمی‌رود)
//       - نوشتن → راستی‌آزمایی کریپتویی → در صورت خرابی، بازگرداندن خودکار
//       - ثبت در همان rotations.jsonl با قالب چرخش (restored:true) —
//         تاریخچه/داشبورد/«سطرهای خراب» بدون تغییر کار می‌کنند
//       - نوسازی حافظه‌ی تأیید (reloadAcceptedKeys) بدون ری‌استارت؛ کدهای صادرشده
//         با کلیدِ عوضشده تا پایان exp همچنان پذیرفته می‌مانند (تأیید چندکلیدی)
// ============================================================

/** مسیر فایل عمومیِ بایگانی‌شده برای یک kid — اول پوشه‌ی بایگانی، بعد ریشه‌ی keys */
function archivedPublicPath(kid: string): string | null {
  const dir = keysDir();
  const candidates = [
    join(dir, 'accepted_license_public_keys', `license_public_${kid}.pem`),
    join(dir, `license_public_${kid}.pem`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** مسیر فایل خصوصیِ بایگانی‌شده برای یک kid (همان license_private_<kid>.pem چرخش) */
function archivedPrivatePath(kid: string): string | null {
  const dir = keysDir();
  const p = join(dir, `license_private_${kid}.pem`);
  return existsSync(p) ? p : null;
}

function assertKidShape(kid: string): void {
  if (!/^[0-9a-f]{8}$/.test(kid)) throw new KeyRotationError('قالب kid نامعتبر است — ۸ نویسه هگز (مثال a1b2c3d4).', 400);
}

/** تطابق جفت‌کلید: SPKI استخراج‌شده از خصوصی باید برابر عمومی باشد */
function privateMatchesPublic(privPem: string, pubPem: string): boolean {
  try {
    const derived = createPublicKey(privPem).export({ type: 'spki', format: 'der' });
    const pub = createPublicKey(pubPem).export({ type: 'spki', format: 'der' });
    return Buffer.from(derived).equals(Buffer.from(pub));
  } catch {
    return false;
  }
}

export interface ArchivedKeyVerify {
  ok: boolean;
  kid: string;
  /** این kid در رجیستری چرخش (به‌عنوان old یا new) ثبت شده؟ */
  in_registry: boolean;
  registry_rotated_at: string | null;
  registry_by: string | null;
  /** آیا الان همین کلید، کلید جاری صدور است؟ */
  is_current: boolean;
  public_found: boolean;
  public_path: string | null;
  /** kid محاسبه‌شده از PEM بایگانی برابر kid درخواستی است؟ */
  public_kid_matches: boolean | null;
  private_found: boolean;
  private_path: string | null;
  /** کلید خصوصیِ همان kid با عمومی‌اش تطابق رمزنگاری دارد؟ */
  private_matches_public: boolean | null;
  error?: string;
}

/** تأیید سلامت کلید قبلی از بایگانی/رجیستری — فقط‌خواندنی (GET keys/rotations/:kid/verify) */
export function verifyArchivedKey(kid: string): ArchivedKeyVerify {
  assertKidShape(kid);
  const reg = rotationHistory();
  const entry = reg.rotations.find((r) => r.old_kid === kid || r.new_kid === kid) ?? null;
  const pubPath = archivedPublicPath(kid);
  const privPath = archivedPrivatePath(kid);
  if (!pubPath && !privPath && !entry) {
    throw new KeyRotationError(`کلیدی با kid=${kid} در رجیستری چرخش یا بایگانی یافت نشد.`, 404);
  }

  let pubPem: string | null = null;
  if (pubPath) { try { pubPem = readFileSync(pubPath, 'utf8'); } catch { /* در ادامه گزارش می‌شود */ } }
  let computed: string | null = null;
  if (pubPem) { try { computed = publicKid(pubPem); } catch { /* PEM خراب */ } }
  let privPem: string | null = null;
  if (privPath) { try { privPem = readFileSync(privPath, 'utf8'); } catch { /* در ادامه گزارش می‌شود */ } }
  let current: string | null = null;
  try { current = currentKid(); } catch { /* کلید جاری نیست */ }

  const pubFound = !!pubPath && !!pubPem;
  const kidMatches = pubFound ? computed === kid : null;
  const privFound = !!privPath && !!privPem;
  const privMatches = pubFound && privFound ? privateMatchesPublic(privPem!, pubPem!) : null;

  const problems: string[] = [];
  if (!pubFound) problems.push('فایل عمومیِ بایگانی‌شده این kid موجود یا خوانا نیست.');
  if (kidMatches === false) problems.push(`kid محاسبه‌شده از فایل (${computed}) با kid درخواستی نمی‌خواند.`);
  if (privFound && pubFound && privMatches === false) problems.push('کلید خصوصیِ بایگانی‌شده با کلید عمومی همان kid تطابق رمزنگاری ندارد.');

  return {
    ok: problems.length === 0,
    kid,
    in_registry: !!entry,
    registry_rotated_at: entry?.rotated_at ?? null,
    registry_by: entry?.by ?? null,
    is_current: current === kid,
    public_found: pubFound,
    public_path: pubPath,
    public_kid_matches: kidMatches,
    private_found: privFound,
    private_path: privPath,
    private_matches_public: privMatches,
    ...(problems.length ? { error: problems.join(' ') } : {}),
  };
}

export interface RestoreKeyResult {
  ok: boolean;
  restored_kid: string;
  previous_kid: string | null;
  public_restored: boolean;
  private_restored: boolean;
  /** کلیدهای جاریِ عوض‌شده کجا بایگانی شدند (هیچ‌چیز از دست نرفت) */
  previous_backed_up_as: { public: string | null; private: string | null };
  registry_path: string;
  rotated_at: string;
  current_kid: string;
  accepted_kids: string[];
  guide: string[];
}

/**
 * بازیابی جفت‌کلید قبلی از بایگانی به جایگاه جاری (POST keys/restore) —
 * اتمی‌ترین حد ممکن: خواندن/اعتبارسنجی همه‌چیز ← بایگانیِ جاری ← نوشتن ←
 * راستی‌آزمایی ← (در صورت خرابی) بازگرداندن خودکار ← رجیستری ← نوسازی حافظه.
 */
export function restoreSigningKey(kid: string): RestoreKeyResult {
  assertKidShape(kid);
  const dir = keysDir();
  const pubSrc = archivedPublicPath(kid);
  const privSrc = archivedPrivatePath(kid);
  if (!pubSrc && !privSrc) {
    // هیچ فایلی نیست: در رجیستری ثبت شده؟ (ثبت‌شده ولی فایل‌ها پاک‌شده → ناقص) — ناموجود → ۴۰۴
    const reg = rotationHistory();
    const known = reg.rotations.some((r) => r.old_kid === kid || r.new_kid === kid);
    if (!known) throw new KeyRotationError(`کلیدی با kid=${kid} در رجیستری چرخش یا بایگانی یافت نشد.`, 404);
    throw new KeyRotationError(
      `جفت‌کلید کاملِ kid=${kid} بایگانی نشده است (عمومی: ندارد · خصوصی: ندارد) — فایل‌های این kid پاک شده‌اند؛ بازیای ممکن نیست.`,
      409,
    );
  }
  if (!pubSrc || !privSrc) {
    throw new KeyRotationError(
      `جفت‌کلید کاملِ kid=${kid} بایگانی نشده است (عمومی: ${pubSrc ? 'موجود' : 'ندارد'} · خصوصی: ${privSrc ? 'موجود' : 'ندارد'}) — بازیابی فقط با جفت‌کلید کامل ممکن است تا صدور و تأیید هماهنگ بمانند.`,
      409,
    );
  }
  const restoredPub = readFileSync(pubSrc, 'utf8');
  const restoredPriv = readFileSync(privSrc, 'utf8');
  const restoredKidComputed = publicKid(restoredPub);
  if (restoredKidComputed !== kid) {
    throw new KeyRotationError(`فایل عمومیِ بایگانی با kid درخواستی نمی‌خواند (محاسبه‌شده: ${restoredKidComputed}).`, 409);
  }
  if (!privateMatchesPublic(restoredPriv, restoredPub)) {
    throw new KeyRotationError('کلید خصوصیِ بایگانی با کلید عمومی همان kid تطابق ندارد — بازیابی متوقف شد.', 409);
  }

  let previousKid: string | null = null;
  try { previousKid = currentKid(); } catch { /* کلید جاری نیست — بازیابی خالص */ }
  if (previousKid === kid) throw new KeyRotationError(`کلید جاری همین kid=${kid} است؛ بازیای لازم نیست.`, 409);

  const pubPath = join(dir, 'license_public.pem');
  const privPath = join(dir, 'license_private.pem');

  // ۱) بایگانیِ کلیدهای جاری — بدون حذف/بازنویسی بایگانیِ موجود
  const backupPubAs = previousKid ? join(dir, 'accepted_license_public_keys', `license_public_${previousKid}.pem`) : null;
  const backupPrivAs = previousKid ? join(dir, `license_private_${previousKid}.pem`) : null;
  if (previousKid) {
    try {
      if (backupPubAs && !existsSync(backupPubAs)) {
        mkdirSync(join(dir, 'accepted_license_public_keys'), { recursive: true });
        copyFileSync(pubPath, backupPubAs);
      }
      if (backupPrivAs && !existsSync(backupPrivAs)) copyFileSync(privPath, backupPrivAs);
    } catch (e) {
      throw new KeyRotationError(`پشتیبان‌گیری از کلیدهای جاری ناموفق بود — بازیابی انجام نشد: ${(e as Error).message}`, 500);
    }
  }

  // ۲) جایگزینی
  writeFileSync(privPath, restoredPriv);
  writeFileSync(pubPath, restoredPub);

  // ۳) راستی‌آزماییِ نوشته‌شده — در صورت خرابی، بازگرداندن از همان بایگانی تازه‌ساخته
  const writtenPub = readFileSync(pubPath, 'utf8');
  const writtenPriv = readFileSync(privPath, 'utf8');
  if (publicKid(writtenPub) !== kid || !privateMatchesPublic(writtenPriv, writtenPub)) {
    try {
      if (backupPubAs && existsSync(backupPubAs)) copyFileSync(backupPubAs, pubPath);
      if (backupPrivAs && existsSync(backupPrivAs)) copyFileSync(backupPrivAs, privPath);
    } catch { /* بهترین تلاش */ }
    throw new KeyRotationError('راستی‌آزمایی پس از نوشتن شکست خورد — کلیدهای جاری از بایگانی بازگردانده شدند.', 500);
  }

  // ۴) رجیستری — همان قالب چرخش (restored:true) تا تاریخچه/داشبورد بدون تغییر کار کنند؛
  //    وقتی کلید جاری‌ای نبود، old_kid همان kid می‌نشیند تا خط رجیستری «خراب» حساب نشود
  const rotatedAt = new Date().toISOString();
  const registry = join(dir, 'rotations.jsonl');
  try {
    appendFileSync(registry, JSON.stringify({
      rotated_at: rotatedAt,
      old_kid: previousKid ?? kid,
      new_kid: kid,
      archived_pub: backupPubAs ?? pubSrc,
      restored: true,
      by: 'admin-panel-restore',
    }) + '\n', 'utf8');
  } catch (e) {
    console.error('⚠ ثبت رجیستری بازیابی کلید ناموفق:', (e as Error).message);
  }

  // ۵) نوسازی حافظه‌ی تأیید — بدون ری‌استارت؛ کدهای کلید عوض‌شده پذیرفته می‌مانند
  const info = reloadAcceptedKeys();

  return {
    ok: true,
    restored_kid: kid,
    previous_kid: previousKid,
    public_restored: true,
    private_restored: true,
    previous_backed_up_as: {
      public: backupPubAs && existsSync(backupPubAs) ? backupPubAs : null,
      private: backupPrivAs && existsSync(backupPrivAs) ? backupPrivAs : null,
    },
    registry_path: registry,
    rotated_at: rotatedAt,
    current_kid: info.current_kid,
    accepted_kids: info.accepted_kids,
    guide: [
      `کلید kid=${kid} دوباره کلید جاری شد؛ صدور کد از همین حالا با این کلید انجام می‌شود.`,
      previousKid
        ? `کلید جاریِ قبلی (kid=${previousKid}) در بایگانی ماند و برای تأیید کدهای صادرشده در این فاصله پذیرفته می‌شود.`
        : 'پیش از بازیابی، کلید جاری‌ای روی دیسک نبود.',
      'اگر بیش از یک سرور نصب دارید، فایل بازیابی‌شده (keys/license_public.pem) را به سرورهای دیگر هم منتقل کنید.',
    ],
  };
}
