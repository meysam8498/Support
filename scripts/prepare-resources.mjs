#!/usr/bin/env node
// ============================================================
// prepare-resources — آماده‌سازی رزورس‌های پوسته‌ی دسکتاپ (Tauri)
// خروجی در desktop/src-tauri/resources/ (gitignore شده):
//   server/server.mjs  ← باندل esbuild از server/dist/index.js (+ schema.sql و کلید عمومی)
//   client/            ← client/dist (سرور آن را سرو می‌کند — CLIENT_DIST)
//   runtime/node.exe   ← کپی node محلی (اجرای باندل بدون نیاز به نصب Node)
//   static/            ← صفحات «در حال آماده‌سازی» و «خطا» (از static-src)
//   (کلید خصوصی هرگز کپی نمی‌شود — نصب support آن را از %LOCALAPPDATA% می‌خواند)
// استفاده: node scripts/prepare-resources.mjs [customer|support]
// ============================================================
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = process.argv[2] === 'support' ? 'support' : 'customer';
const RES = join(ROOT, 'desktop', 'src-tauri', 'resources');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const step = (m) => console.log(`  • ${m}`);
const die = (m) => { console.error(`✖ ${m}`); process.exit(1); };

console.log(`— prepare-resources [${PROFILE}] v${VERSION}`);

// ۰) پیش‌نیازها: بیلد سرور و کلاینت باید موجود باشد
if (!existsSync(join(ROOT, 'server', 'dist', 'index.js'))) die('server/dist/index.js نیست — اول «npm run build -w server» را اجرا کنید.');
if (!existsSync(join(ROOT, 'client', 'dist', 'index.html'))) die('client/dist/index.html نیست — اول «npm run build -w client» را اجرا کنید.');

// dist کهنه = نصب‌کننده‌ای که کد قدیمی سرور را حمل می‌کند (۱.۳۴.۰: kid در هدر از همین راه غایب شد)
const newest = (dir, ext) => {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) t = Math.max(t, newest(p, ext));
    else if (e.name.endsWith(ext)) t = Math.max(t, statSync(p).mtimeMs);
  }
  return t;
};
const distTime = statSync(join(ROOT, 'server', 'dist', 'index.js')).mtimeMs;
const srcTime = Math.max(newest(join(ROOT, 'server', 'src'), '.ts'), distTime);
if (srcTime > distTime + 1000) die('server/dist از سورس قدیمی‌تر است — اول «npm run build -w server» را اجرا کنید.');

const clientDistTime = statSync(join(ROOT, 'client', 'dist', 'index.html')).mtimeMs;
const clientSrcTime = Math.max(newest(join(ROOT, 'client', 'src'), ''), clientDistTime);
if (clientSrcTime > clientDistTime + 1000) die('client/dist از سورس قدیمی‌تر است — اول «npm run build -w client» را اجرا کنید.');

rmSync(RES, { recursive: true, force: true });
mkdirSync(join(RES, 'server'), { recursive: true });
mkdirSync(join(RES, 'static'), { recursive: true });

// ۱) باندل سرور با esbuild — تک‌فایل ESM (کد سرور top-level await دارد؛ CJS نمی‌پذیرد)
step('باندل سرور با esbuild…');
await build({
  entryPoints: [join(ROOT, 'server', 'dist', 'index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(RES, 'server', 'server.mjs'),
  minify: false,
  sourcemap: false,
  logLevel: 'silent',
  // وابستگی‌های CJS (express و…) در خروجی ESM به require نیاز دارند — شیم استاندارد esbuild
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
  footer: { js: `// bundle v${VERSION} — profile: ${PROFILE} (prepare-resources.mjs)` },
});
cpSync(join(ROOT, 'server', 'dist', 'db', 'schema.sql'), join(RES, 'server', 'schema.sql'));
// کلید عمومی لایسنس — کاندیدای دوم licenseCode.ts همین‌جا را می‌خواند (import.meta.url باندل)
// منبع حقیقت keys/license_public.pem است (بعد از چرخش کلید هم‌گام می‌ماند)؛ اگر نبود، نسخه‌ی مخزن.
const rootPub = join(ROOT, 'keys', 'license_public.pem');
cpSync(
  existsSync(rootPub) ? rootPub : join(ROOT, 'server', 'dist', 'lib', 'license_public_key.pem'),
  join(RES, 'server', 'license_public_key.pem')
);
step(`server.mjs (${(readFileSync(join(RES, 'server', 'server.mjs'), 'utf8').length / 1024 / 1024).toFixed(1)}MB) + schema.sql + کلید عمومی`);

// ۲) فرانت بیلدشده — سرور با CLIENT_DIST همین پوشه را سرو می‌کند
step('کپی فرانت (client/dist → resources/client)…');
cpSync(join(ROOT, 'client', 'dist'), join(RES, 'client'), { recursive: true });

// ۳) node.exe — کپی از نصب محلی (اولین نتیجه‌ی where node)
step('کپی node.exe…');
let nodePath = process.execPath; // fallback: همان node در حال اجرا
try {
  const where = execSync('where node', { encoding: 'utf8' }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (where[0]) nodePath = where[0];
} catch { /* fallback */ }
mkdirSync(join(RES, 'runtime'), { recursive: true });
cpSync(nodePath, join(RES, 'runtime', 'node.exe'));
step(`node.exe از ${nodePath}`);

// ۴) صفحات static (منبع: desktop/src-tauri/static-src — کامیت می‌شود)
step('صفحات static…');
cpSync(join(ROOT, 'desktop', 'src-tauri', 'static-src'), join(RES, 'static'), { recursive: true });
// + نسخه‌ی frontendDist (تا cargo/bundler مسیر موجود را ببیند — gitignore شده)
cpSync(join(ROOT, 'desktop', 'src-tauri', 'static-src'), join(ROOT, 'desktop', 'src-tauri', 'static-dist'), { recursive: true });

// ۵) فایل نسخه + پروفایل — برای نمایش/دیباگ
writeFileSync(join(RES, 'server', 'app-info.json'), JSON.stringify({ version: VERSION, profile: PROFILE }, null, 2));

// ۶) کلید خصوصی صدور — عمداً هیچ‌وقت داخل بسته نمی‌رود (نه مشتری، نه پشتیبانی).
// دلیل: فایل نصب قابل استخراج است و کلید داخل آن یعنی جعل لایسنس توسط هر دارنده‌ی فایل.
// نصب پشتیبانی کلید را از %LOCALAPPDATA%\SupportSupportServer\keys\license_private.pem می‌خواند.
if (existsSync(join(ROOT, 'keys', 'license_private.pem'))) {
  step('کلید خصوصی عمداً بسته‌بندی نشد — نصب پشتیبانی آن را از پوشه‌ی محلی می‌خواند. ✓');
} else {
  step('هشدار: keys/license_private.pem روی این سیستم نیست — صدور لایسنس کار نمی‌کند.');
}

console.log(`✔ رزورس‌ها آماده است: ${RES}`);
