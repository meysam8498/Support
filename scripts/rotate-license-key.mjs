#!/usr/bin/env node
// ============================================================
// rotate-license-key — چرخش کامل کلید لایسنس + هم‌گام‌سازی همه‌ی نقاط مصرف
// ----------------------------------------------------------------
// یک دستور، همه‌ی کارهایی که پیش‌تر دستی انجام می‌شد:
//   ۱) جفت‌کلید جدید RS256 (2048) می‌سازد و جای کلید جاری می‌گذارد
//   ۲) کلید عمومی قدیمی → keys/accepted_license_public_keys/license_public_<kid>.pem
//      (تا کدهای صادرشده‌ی قبلی همچنان معتبر بمانند)
//   ۳) کلید خصوصی قدیمی → keys/private-archive/license_private_<kid>.pem
//      (هرگز داخل بسته/گیت نمی‌رود؛ keys/ در .gitignore است)
//   ۴) رجیستری keys/rotations.jsonl را ثبت می‌کند
//   ۵) کلید عمومی را در سرور هم‌گام می‌کند:
//        server/src/lib/license_public_key.pem (ردیابی‌شده)
//        server/dist/lib/license_public_key.pem (اگر بیلد موجود باشد)
//   ۶) پوشه‌ی کلید نصب‌شده در دستگاه را هم‌گام می‌کند
//      (%LOCALAPPDATA%\SupportSupportServer\keys): کلید جدید، کلیدهای پذیرفته‌شده
//      و بایگانی کلید خصوصی قدیمی در retired/
//   ۷) با --build: بیلد سرور + prepare-resources (باندل و رزورس دسکتاپ) را اجرا می‌کند
//
// استفاده:
//   node scripts/rotate-license-key.mjs --dry-run          # پیش‌نمایش بدون تغییر
//   node scripts/rotate-license-key.mjs                    # چرخش + هم‌گام‌سازی سرور و نصب محلی
//   node scripts/rotate-license-key.mjs --build            # + بیلد سرور و بسته‌بندی رزورس‌ها
//   node scripts/rotate-license-key.mjs --skip-app         # بدون دست‌زدن به پوشه‌ی نصب
//   node scripts/rotate-license-key.mjs --keys <dir>       # پوشه‌ی کلید دیگر (تست)
//
// ⓘ پس از چرخش، صدور از پنل فروشنده بلافاصله با kid جدید انجام می‌شود
//   (کش کلیدها در سرور با reloadAcceptedKeys نوسازی می‌شود؛ در اپ دسکتاپ
//   کلید از همین پوشه خوانده می‌شود). برای نصب‌کننده‌ی جدید باید بیلد گرفته شود.
// ============================================================
import { generateKeyPairSync, createHash, createSign, createVerify, createPublicKey } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);

const KEYS = resolve(opt('--keys') ?? join(ROOT, 'keys'));
const DRY = has('--dry-run');
const BUILD = has('--build');
const SKIP_APP = has('--skip-app');

const step = (m) => console.log(`  • ${m}`);
const die = (m) => {
  console.error(`✖ ${m}`);
  process.exit(1);
};
const kidOf = (pem) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

/** پوشه‌ی کلید نصب دسکتاپ — همان مسیری که paths.rs می‌سازد */
function defaultAppKeysDir() {
  const app = 'SupportSupportServer';
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), app, 'keys');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', app, 'keys');
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), app, 'keys');
}

const APP_KEYS = resolve(opt('--app-keys') ?? defaultAppKeysDir());

const privPath = join(KEYS, 'license_private.pem');
const pubPath = join(KEYS, 'license_public.pem');
const acceptedDir = join(KEYS, 'accepted_license_public_keys');
const privateArchiveDir = join(KEYS, 'private-archive');
const registry = join(KEYS, 'rotations.jsonl');

console.log(`— چرخش کلید لایسنس${DRY ? ' (پیش‌نمایش)' : ''}`);
step(`پوشه‌ی کلید پروژه: ${KEYS}`);
step(`پوشه‌ی کلید نصب: ${SKIP_APP ? '(نادیده گرفته شد — --skip-app)' : APP_KEYS}`);

// ---------------- ۰) اعتبارسنجی قبل از هر تغییری ----------------
if (!existsSync(privPath) || !existsSync(pubPath)) {
  die(`جفت‌کلید جاری پیدا نشد: ${privPath} و ${pubPath} — اول «node scripts/make-license-code.mjs --gen-keys» را اجرا کنید.`);
}
const oldPriv = readFileSync(privPath, 'utf8');
const oldPub = readFileSync(pubPath, 'utf8');
const oldKid = kidOf(oldPub);

const derivedOldKid = kidOf(createPublicKey(oldPriv).export({ type: 'spki', format: 'pem' }));
if (derivedOldKid !== oldKid) {
  die(`کلید خصوصی و عمومی جاری با هم نمی‌خوانند (priv→${derivedOldKid} ≠ pub→${oldKid}). اول این ناسازگاری را درست کنید.`);
}

const archivedPub = join(acceptedDir, `license_public_${oldKid}.pem`);
const archivedPriv = join(privateArchiveDir, `license_private_${oldKid}.pem`);
if (existsSync(archivedPriv) && readFileSync(archivedPriv, 'utf8') !== oldPriv) {
  die(`بایگانی خصوصی قدیمی از قبل با محتوای متفاوت هست: ${archivedPriv} — دستی بررسی کنید.`);
}
if (existsSync(archivedPub) && readFileSync(archivedPub, 'utf8') !== oldPub) {
  die(`کلید عمومی پذیرفته‌شده‌ی هم‌نام با محتوای متفاوت هست: ${archivedPub} — دستی بررسی کنید.`);
}

// ---------------- ۱) جفت‌کلید جدید + خودآزمون ----------------
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const newPub = String(publicKey);
const newPriv = String(privateKey);
const newKid = kidOf(newPub);

const probe = `self-check-${Date.now()}`;
const signer = createSign('RSA-SHA256');
signer.update(probe);
const sig = signer.sign(newPriv, 'base64url');
const verifier = createVerify('RSA-SHA256');
verifier.update(probe);
if (!verifier.verify(newPub, sig, 'base64url')) die('جفت‌کلید تازه خودآزمون امضا را رد کرد — چرخش انجام نشد.');
if (newKid === oldKid) die('کید کلید جدید با کلید قبلی یکسان شد — چرخش انجام نشد.');

step(`کلید جاری: ${oldKid} → کلید جدید: ${newKid} (امضا/تأیید خودآزمون سبز)`);

// کلید عمومی سرور فقط وقتی هم‌گام می‌شود که با پوشه‌ی کلید رسمی پروژه کار می‌کنیم
// (اجرای آزمون با --keys موقت نباید کلید داخل سورس را عوض کند)
const isOfficialKeysDir = KEYS === resolve(join(ROOT, 'keys'));
const serverPems = isOfficialKeysDir
  ? [
      join(ROOT, 'server', 'src', 'lib', 'license_public_key.pem'),
      join(ROOT, 'server', 'dist', 'lib', 'license_public_key.pem'),
    ].filter((p) => existsSync(p))
  : [];
const appKeysExists = existsSync(join(APP_KEYS, 'license_private.pem'));
if (!SKIP_APP && !appKeysExists) step(`ⓘ پوشه‌ی کلید نصب هنوز کلید خصوصی ندارد — فقط عمومی/پذیرفته‌شده‌ها آنجا نوشته می‌شوند.`);

if (DRY) {
  step(`[پیش‌نمایش] بایگانی عمومی قدیمی → ${archivedPub}`);
  step(`[پیش‌نمایش] بایگانی خصوصی قدیمی → ${archivedPriv}`);
  step(`[پیش‌نمایش] نوشتن جفت‌کلید جدید در ${KEYS}`);
  step(`[پیش‌نمایش] هم‌گام‌سازی ${serverPems.length} فایل کلید عمومی سرور`);
  if (!SKIP_APP) step('[پیش‌نمایش] هم‌گام‌سازی پوشه‌ی کلید نصب (کلید جدید + پذیرفته‌شده‌ها + retired/)');
  if (BUILD) step('[پیش‌نمایش] بیلد سرور + prepare-resources');
  console.log('✓ پیش‌نمایش تمام شد — هیچ فایلی تغییر نکرد.');
  process.exit(0);
}

// ---------------- ۲) بایگانی قدیمی و نوشتن جدید ----------------
mkdirSync(acceptedDir, { recursive: true });
mkdirSync(privateArchiveDir, { recursive: true });
if (!existsSync(archivedPub)) copyFileSync(pubPath, archivedPub);
else step('همان کلید عمومی قدیمی از قبل بایگانی شده بود — رد شد.');
writeFileSync(archivedPriv, oldPriv, { mode: 0o600 });
writeFileSync(pubPath, newPub);
writeFileSync(privPath, newPriv, { mode: 0o600 });
step(`کلید عمومی قدیمی → ${archivedPub}`);
step(`کلید خصوصی قدیمی → ${archivedPriv}`);
step(`جفت‌کلید جدید نوشته شد (kid=${newKid})`);

// ---------------- ۳) رجیستری ----------------
const rotatedAt = new Date().toISOString();
appendFileSync(
  registry,
  JSON.stringify({ rotated_at: rotatedAt, old_kid: oldKid, new_kid: newKid, archived_pub: archivedPub, by: 'rotate-license-key.mjs' }) + '\n',
  'utf8',
);
step(`رجیستری چرخش → ${registry}`);

// ---------------- ۴) هم‌گام‌سازی کلید عمومی سرور ----------------
for (const p of serverPems) {
  writeFileSync(p, newPub);
  step(`کلید عمومی سرور → ${p}`);
}
if (!isOfficialKeysDir) {
  step('ⓘ با --keys غیررسمی اجرا شد — کلید عمومی سرور دست نخورد.');
} else if (serverPems.length === 1) {
  step('ⓘ server/dist موجود نبود — پس از بیلد سرور، کلید عمومی هم به‌روز می‌شود (prepare-resources آن را هم می‌نویسد).');
}

// ---------------- ۵) هم‌گام‌سازی پوشه‌ی کلید نصب ----------------
if (SKIP_APP) {
  step('پوشه‌ی کلید نصب هم‌گام نشد (--skip-app) — روی دستگاه‌ها باید دستی کپی شود.');
} else {
  mkdirSync(APP_KEYS, { recursive: true });
  const appAccepted = join(APP_KEYS, 'accepted_license_public_keys');
  const appRetired = join(APP_KEYS, 'retired');
  mkdirSync(appAccepted, { recursive: true });
  mkdirSync(appRetired, { recursive: true });

  // کلید خصوصی قدیمیِ نصب → retired/ (چون دیگر نباید با آن امضا شود)
  if (existsSync(join(APP_KEYS, 'license_private.pem'))) {
    const target = join(appRetired, `license_private_${oldKid}.pem`);
    if (!existsSync(target)) {
      renameSync(join(APP_KEYS, 'license_private.pem'), target);
      step(`کلید خصوصی قبلی نصب → ${target}`);
    } else {
      rmSync(join(APP_KEYS, 'license_private.pem'), { force: true });
    }
  }
  writeFileSync(join(APP_KEYS, 'license_private.pem'), newPriv, { mode: 0o600 });
  writeFileSync(join(APP_KEYS, 'license_public.pem'), newPub);
  step(`جفت‌کلید جدید → ${APP_KEYS}`);

  // همه‌ی کلیدهای پذیرفته‌شده (قدیمی + هر سابقه‌ی دیگر) کنار نصب
  let copied = 0;
  for (const f of readdirSync(acceptedDir)) {
    if (!/^license_public_[0-9a-f]{8}\.pem$/.test(f)) continue;
    copyFileSync(join(acceptedDir, f), join(appAccepted, f));
    copied++;
  }
  step(`${copied} کلید پذیرفته‌شده → ${appAccepted}`);

  const appRegistry = join(APP_KEYS, 'rotations.jsonl');
  appendFileSync(
    appRegistry,
    JSON.stringify({ rotated_at: rotatedAt, old_kid: oldKid, new_kid: newKid, archived_pub: archivedPub, by: 'rotate-license-key.mjs' }) + '\n',
    'utf8',
  );
  step(`رجیستری چرخش نصب → ${appRegistry}`);
}

// ---------------- ۶) بیلد اختیاری ----------------
if (BUILD) {
  step('بیلد سرور (npm run build -w server)…');
  execSync('npm run build -w server', { cwd: ROOT, stdio: 'inherit' });
  // بیلد سرور فایل کلید عمومی داخل dist را از src کپی می‌کند؛ برای اطمینان دوباره می‌نویسیم
  const distPem = join(ROOT, 'server', 'dist', 'lib', 'license_public_key.pem');
  if (existsSync(dirname(distPem))) {
    writeFileSync(distPem, newPub);
    step(`کلید عمومی سرور پس از بیلد → ${distPem}`);
  }
  step('بسته‌بندی رزورس‌های دسکتاپ (prepare-resources customer)…');
  execSync('node scripts/prepare-resources.mjs customer', { cwd: ROOT, stdio: 'inherit' });
}

// ---------------- ۷) خلاصه ----------------
const accepted = readdirSync(acceptedDir)
  .map((f) => /^license_public_([0-9a-f]{8})\.pem$/.exec(f)?.[1])
  .filter(Boolean);
console.log('');
console.log(`✓ چرخش انجام شد: ${oldKid} → ${newKid}`);
console.log(`  کلیدهای پذیرفته‌شده (${accepted.length + 1}): ${[...new Set([...accepted, newKid])].join(', ')}`);
console.log('  کدهای صادرشده با کلیدهای قبلی تا پایان exp خود معتبر می‌مانند.');
if (!BUILD) {
  console.log('');
  console.log('→ برای رسیدن به نصب‌کننده‌های جدید:');
  console.log('    npm run build -w server && npm run build -w client');
  console.log('    node scripts/prepare-resources.mjs customer   # سپس: cd desktop && npm run build:customer');
  console.log('    node scripts/prepare-resources.mjs support    # سپس: cd desktop && npm run build:support');
}
