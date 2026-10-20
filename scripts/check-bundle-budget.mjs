#!/usr/bin/env node
// ============================================================
// چک بودجه‌ی باندل کلاینت — CI و اجرای محلی
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// -------------------------------------------------------------------
// چه چیزی را تضمین می‌کند (روی بیلد production واقعی، نه حدس):
//   ۱) بیلد کلاینت سبز می‌شود (شامل tsc -b؛ typecheck هم پوشش داده می‌شود)
//   ۲) هیچ هشدار باندلینگی در خروجی بیلد نیست (هشدارهای vite/rolldown مثل
//      INEFFECTIVE_DYNAMIC_IMPORT یا chunk size — کد lazy نشدن صفحات را لو می‌دهد)
//   ۳) حجم gzip چانک‌ها در بودجه‌ی تعیین‌شده می‌ماند:
//        • چانک‌های اولیه (index/vendor/api/css/runtime) → payload اول بارگذاری
//        • هر چانک lazy (صفحات جداشده با React.lazy) → سقف تک‌فایل
// بودجه‌ها عمداً کمی بالاتر از اندازه‌ی فعلی‌اند تا رشد ناگهانی را بگیرند،
// نه افزایش جزئی طبیعی را. با ENV می‌توان محلی آزمود (BUDGET_*=1 کوچک → fail).
// استفاده:
//   node scripts/check-bundle-budget.mjs             # CI — بیلد کامل + اسکن هشدار + بودجه
//   node scripts/check-bundle-budget.mjs --no-build  # فقط سنجش dist موجود (بدون بیلد).
//     npm run build -w client همین حالت را بعد از vite build اجرا می‌کند تا خودِ بیلد
//     (و ساخت داکر) هم با عبور index از سقف، قرمز شود — بدون حلقه: این‌جا دیگر بیلد نمی‌شود
//   BUDGET_INDEX_KB=1 node scripts/check-bundle-budget.mjs   # آزمون مسیر شکست
// خروجی: جدول ✓/✗ هر چانک + کد خروج 0/1
// ============================================================
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'client', 'dist');
const ASSETS = join(DIST, 'assets');

// ─────────── بودجه‌ها (kB, gzip) — فعلی: index≈63 · vendor≈60 · css≈12 ───────────
const BUDGET = {
  indexJsKb: Number(process.env.BUDGET_INDEX_KB) || 70,     // چانک اصلی صفحات/کامپوننت‌ها
  vendorJsKb: Number(process.env.BUDGET_VENDOR_KB) || 70,   // react/react-dom/router
  cssKb: Number(process.env.BUDGET_CSS_KB) || 16,           // کل CSS اول بارگذاری
  initialTotalKb: Number(process.env.BUDGET_INITIAL_KB) || 170, // مجموع payload اول
  lazyChunkKb: Number(process.env.BUDGET_LAZY_KB) || 20,    // هر چانک جداشده (lazy)
};

const NO_BUILD = process.argv.includes('--no-build');

let fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) fail++;
};

// ─────────── ۱) بیلد واقعی کلاینت (stdout+stderr برای اسکن هشدارها) ───────────
console.log('🧪 چک بودجه‌ی باندل کلاینت\n' + '─'.repeat(60));
let buildOut = '';
if (NO_BUILD) {
  console.log('— حالت --no-build: بیلد انجام نمی‌شود؛ همان dist موجود (تازه‌شده توسط vite build) سنجیده می‌شود');
} else {
  console.log('— بیلد کلاینت (tsc -b && vite build)');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npmCmd, ['run', 'build', '-w', 'client'], {
    cwd: ROOT,
    encoding: 'utf8',
    // shell روی ویندوز برای پیدا کردن npm؛ در لینوکس CI بی‌اثر است
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1' },
  });
  buildOut = `${build.stdout || ''}\n${build.stderr || ''}`;
  ok('بیلد کلاینت exit 0', build.status === 0, `status=${build.status}\n${buildOut.slice(-800)}`);
}

// ─────────── ۲) هیچ هشدار باندلینگی نباید در خروجی بیلد باشد (حالت بیلد کامل) ───────────
// الگوهای هشدار rolldown/vite: «warning»، مثلث هشدار، و هشدار مشخص عدم‌پویایی
// در حالت --no-build خروجی بیلد در دسترس نیست؛ اسکن هشدار در حالت کامل (CI) انجام می‌شود
const WARN_RE = /warning|▲|ineffective_dynamic_import|is dynamically imported/i;
if (NO_BUILD) {
  console.log('— اسکن هشدار بیلد: فقط در حالت کامل (بدون --no-build)');
} else {
  const warnLines = buildOut.split('\n').filter((l) => WARN_RE.test(l));
  ok('بدون هشدار باندلینگ در خروجی بیلد', warnLines.length === 0, warnLines.slice(0, 5).join(' | '));
}

// ─────────── ۳) بودجه‌ی حجم gzip چانک‌ها ───────────
if (!existsSync(ASSETS)) {
  ok('پوشه‌ی dist/assets موجود است', false, ASSETS);
  summary();
}

const kb = (buf) => Math.round((gzipSync(buf).length / 1024) * 10) / 10;
const files = readdirSync(ASSETS).filter((f) => /\.(js|css)$/.test(f));
/** نام پایه‌ی چانک: index-DMZex_8L.js → index (rolldown-runtime خودش خط تیره دارد) */
const baseOf = (f) => {
  const stem = f.replace(/\.[a-z0-9]+$/i, '');
  return stem.startsWith('rolldown-runtime') ? 'rolldown-runtime' : stem.split('-')[0];
};

let indexJs = null, vendorJs = null, cssTotal = 0;
const lazyChunks = [];
for (const f of files) {
  const size = kb(readFileSync(join(ASSETS, f)));
  const base = baseOf(f);
  const isCss = f.endsWith('.css');
  const isInitial = ['index', 'vendor', 'api', 'rolldown-runtime'].includes(base) || isCss;
  if (base === 'index' && !isCss) indexJs = size;
  else if (base === 'vendor') vendorJs = size;
  if (isCss) cssTotal = round1(cssTotal + size);
  if (!isInitial) lazyChunks.push({ f, size }); // صفحات جداشده با React.lazy و چانک‌های مشترکشان
}
function round1(n) { return Math.round(n * 10) / 10; }
const initialTotal = round1((indexJs ?? 0) + (vendorJs ?? 0) + cssTotal
  + files.filter((f) => baseOf(f) === 'api' || baseOf(f) === 'rolldown-runtime')
      .reduce((s, f) => s + kb(readFileSync(join(ASSETS, f))), 0));

console.log('— بودجه‌ی حجم (gzip)');
ok(`index.js ${indexJs ?? '—'}kB ≤ ${BUDGET.indexJsKb}kB`, indexJs !== null && indexJs <= BUDGET.indexJsKb);
ok(`vendor.js ${vendorJs ?? '—'}kB ≤ ${BUDGET.vendorJsKb}kB`, vendorJs !== null && vendorJs <= BUDGET.vendorJsKb);
ok(`CSS ${cssTotal}kB ≤ ${BUDGET.cssKb}kB`, cssTotal <= BUDGET.cssKb);
ok(`payload اول بارگذاری ${initialTotal}kB ≤ ${BUDGET.initialTotalKb}kB`, initialTotal <= BUDGET.initialTotalKb);
for (const c of lazyChunks) ok(`چانک lazy ${c.f} ${c.size}kB ≤ ${BUDGET.lazyChunkKb}kB`, c.size <= BUDGET.lazyChunkKb);

// پاک‌سازی dist تولیدشده توسط این اسکریپت؟ نه — خروجی برای بررسی دستی مفید است.
summary();

function summary() {
  console.log('─'.repeat(60));
  if (fail > 0) { console.error(`✗ بودجه/هشدار: ${fail} مورد رد شد.`); process.exit(1); }
  console.log('✅ بیلد سبز، بدون هشدار باندلینگ و در بودجه — همه‌ی چانک‌ها سبز.');
  process.exit(0);
}
