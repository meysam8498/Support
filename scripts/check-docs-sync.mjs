#!/usr/bin/env node
// ============================================================
// چک خودکار همگام‌سازی ورژن‌ها و مستندات
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// دو نسخه‌ی مجزا (۱.۲۹) — «نسخه‌ی محصول/مشتری» و «نسخه‌ی سرور»:
//   • نسخه‌ی محصول = package.json ریشه + client + package-lock + تگ Docker + README + OVERVIEW
//   • نسخه‌ی سرور (server/package.json) شماره‌گذاری «مستقل» دارد؛ فقط semver آن چک می‌شود،
//     توسط bump-version هم همگام نمی‌شود (دستی جداگانه bump می‌شود) و از /api/version
//     به‌عنوان server_version گزارش می‌شود — مشتری هرگز آن را نمی‌بیند.
// تضمین می‌کند نسخه‌ی محصول در همه‌ی جاها یکی باشد:
//   • package.json (ریشه + client) و package-lock.json — یکی باشند
//   • server/package.json → فقط semver معتبر (مستقل؛ یکی نبودن با محصول مجاز است)
//   • README.md            → بج «نسخه‌ی فعلی» + ردیف جدول تاریخچه
//   • DOCKER_HUB_OVERVIEW.md → بج «نسخه‌ی فعلی image» + جدول تگ‌ها + تاریخچه
//   • Dockerfile           → هدر + org.opencontainers.image.version
//   • docker-compose.yml   → هدر
// خروجی: کد ۰ = همه‌چیز همگام است؛ کد ۱ = فهرست ناهمگونی‌ها (با پیام فارسی)
// اجرا: node scripts/check-docs-sync.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkDescendingTable, cmpVersions } from './docs-version-table.mjs';

const root = process.cwd();
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const ok = [];
const errors = [];

try {
  const pkgRoot = JSON.parse(read('package.json'));
  const pkgServer = JSON.parse(read('server/package.json'));
  const pkgClient = JSON.parse(read('client/package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const readme = read('README.md');
  const overview = read('DOCKER_HUB_OVERVIEW.md');
  const dockerfile = read('Dockerfile');
  const compose = read('docker-compose.yml');

  const vRoot = pkgRoot.version;
  const vServer = pkgServer.version;
  const vClient = pkgClient.version;
  const vLock = lock.packages?.['']?.version ?? null;

  // --- ۱) نسخه‌ی محصول: ریشه + کلاینت + lock یکی باشند؛ نسخه‌ی سرور فقط semver معتبر ---
  if (vRoot === vClient && vRoot === vLock) {
    ok.push(`نسخه‌ی محصول/مشتری هماهنگ است (ریشه = کلاینت = lock = تگ Docker): ${vRoot}`);
  } else {
    errors.push(`نسخه‌ی محصول ناهماهنگ است → root=${vRoot} | client=${vClient} | lock=${vLock}`);
  }
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(vServer)) {
    ok.push(`نسخه‌ی سرور (مستقل) معتبر است: ${vServer}${vServer === vRoot ? ' — تصادفاً با نسخه‌ی محصول یکی است؛ مستقل نگه‌اش دارید؟' : ''}`);
  } else {
    errors.push(`server/package.json نسخه‌ی semver معتبر ندارد: ${vServer}`);
  }

  // --- ۲) README: بج نسخه + ردیف تاریخچه ---
  if (readme.includes(`**نسخه‌ی فعلی: \`${vRoot}\`**`)) {
    ok.push(`README بج نسخه‌ی فعلی (${vRoot}) را دارد.`);
  } else {
    errors.push(`README بج «نسخه‌ی فعلی: \`${vRoot}\`» ندارد — بج سربرگ را با package.json هماهنگ کنید.`);
  }
  if (new RegExp(`^\\| \\*\\*${vRoot.replace('.', '\\.')}\\*\\* \\| `, 'm').test(readme)) {
    ok.push(`README ردیف تاریخچه‌ی نسخه‌ی ${vRoot} را دارد.`);
  } else {
    errors.push(`README جدول «تاریخچه‌ی نسخه‌ها» ردیف **${vRoot}** را ندارد.`);
  }

  // --- ۳) DOCKER_HUB_OVERVIEW: بج + جدول تگ‌ها + تاریخچه ---
  if (overview.includes(`**نسخه‌ی فعلی image: \`${vRoot}\`**`)) {
    ok.push(`DOCKER_HUB_OVERVIEW بج نسخه‌ی image (${vRoot}) را دارد.`);
  } else {
    errors.push(`DOCKER_HUB_OVERVIEW بج «نسخه‌ی فعلی image: \`${vRoot}\`» ندارد.`);
  }
  if (new RegExp(`^\\| \`${vRoot.replace('.', '\\.')}\` \\| `, 'm').test(overview)) {
    ok.push(`DOCKER_HUB_OVERVIEW ردیف تگ ${vRoot} را دارد.`);
  } else {
    errors.push(`DOCKER_HUB_OVERVIEW جدول «تگ‌های موجود» ردیف \`${vRoot}\` را ندارد.`);
  }
  if (new RegExp(`^\\| \\*\\*${vRoot.replace('.', '\\.')}\\*\\* \\| `, 'm').test(overview)) {
    ok.push(`DOCKER_HUB_OVERVIEW ردیف تاریخچه‌ی ${vRoot} را دارد.`);
  } else {
    errors.push(`DOCKER_HUB_OVERVIEW جدول «تاریخچه‌ی نسخه‌ها» ردیف **${vRoot}** را ندارد.`);
  }

  // --- ۴) Dockerfile: هدر + LABEL نسخه ---
  if (dockerfile.includes(`ARG APP_VERSION=${vRoot}`)) {
    ok.push(`Dockerfile پیش‌فرض ARG APP_VERSION روی ${vRoot} است.`);
  } else {
    errors.push(`Dockerfile مقدار پیش‌فرض ARG APP_VERSION برابر ${vRoot} نیست.`);
  }
  if (dockerfile.includes(`# نسخه: ${vRoot} `) || dockerfile.includes(`# نسخه: ${vRoot}\n`)) {
    ok.push(`Dockerfile هدر نسخه‌ی ${vRoot} را دارد.`);
  } else {
    errors.push(`Dockerfile خط هدر «# نسخه: ${vRoot}» را ندارد.`);
  }

  // --- ۵) docker-compose.yml: هدر نسخه ---
  if (compose.includes(`# نسخه: ${vRoot}`)) {
    ok.push(`docker-compose.yml هدر نسخه‌ی ${vRoot} را دارد.`);
  } else {
    errors.push(`docker-compose.yml خط هدر «# نسخه: ${vRoot}» را ندارد.`);
  }

  // --- ۶) image namespace یکسان ---
  const composeImage = /image:\s*([^\s]+)/.exec(compose)?.[1];
  if (composeImage === 'meysam8498/support-equipment-management:latest') {
    ok.push('نام image در docker-compose روی meysam8498/support-equipment-management است.');
  } else {
    errors.push(`نام image در docker-compose.yml غیرمنتظره است: ${composeImage ?? 'یافت نشد'}`);
  }

  // --- ۷) ترتیب نزولی ردیف‌های جدول‌های تاریخچه/تگ‌ها ---
  // از ماژول مشترک docs-version-table.mjs استفاده می‌شود (همان منطق درج bump-version) —
  // هر جدول باید از نسخه‌ی جدید به قدیمی مرتب باشد؛ latest بالای جدول تگ‌ها و ember پایین آن.
  const checkDescending = (label, text, heading, opts = {}) => {
    const errs = checkDescendingTable(text, heading, opts);
    if (errs.length > 0) {
      for (const e of errs) errors.push(`${label}: ${e}`);
    } else {
      const t = text.indexOf(heading);
      ok.push(`${label}: ترتیب نزولی رعایت شده (منطق مشترک).`);
    }
  };
  checkDescending('README تاریخچه', readme, '## 📋 تاریخچه‌ی نسخه‌ها');
  checkDescending('OVERVIEW جدول تگ‌ها', overview, '## 🏷️ تگ‌های موجود', { latestTop: true, emberBottom: true });
  checkDescending('OVERVIEW تاریخچه', overview, '## 🗂️ تاریخچه‌ی نسخه‌ها');
} catch (err) {
  errors.push(`خطا در خواندن فایل‌ها: ${err.message}`);
}

if (errors.length > 0) {
  console.error('\n✖ ناهمگونی نسخه/مستندات — پیش از کامیت اصلاح کنید:\n');
  for (const e of errors) console.error('  • ' + e);
  console.error('\nراهنما: ورژن را در هر سه package.json بروز کنید، بج و ردیف‌های تاریخچه را در');
  console.error('README.md و DOCKER_HUB_OVERVIEW.md اضافه کنید و هدر/LABEL داکر را هماهنگ کنید.\n');
  process.exit(1);
}

console.log('\n✔ همگام‌سازی نسخه‌ها و مستندات سالم است:');
for (const o of ok) console.log('  • ' + o);
console.log('');
process.exit(0);
