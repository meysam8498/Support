#!/usr/bin/env node
// ============================================================
// bump-version — به‌روزرسانی ورژن و مستندات با یک دستور
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// استفاده:
//   node scripts/bump-version.mjs 1.3.0            # فقط ویرایش فایل‌ها + چک
//   node scripts/bump-version.mjs 1.3.0 --commit   # + کامیت موضوعی
//   node scripts/bump-version.mjs 1.3.0 --commit --with src/a.ts --with src/b.ts  # + ضمیمه‌ی فایل‌های feature
//   node scripts/bump-version.mjs 1.3.0 --commit --tag   # + تگ vX.Y.Z
//   node scripts/bump-version.mjs 1.3.0 --commit --tag --hub  # + PATCH Overview هاب
// نکته: --tag تگ محلی می‌سازد؛ برای راه‌اندازی workflow پابلیش باید push کنید:
//   git push origin vX.Y.Z
// ورژن باید بالاتر از فعلی باشد (بدون v ابتدایی).
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { insertRowUnderHead } from './docs-version-table.mjs';

const NEW = process.argv[2];
if (!NEW || !/^\d+\.\d+\.\d+$/.test(NEW)) {
  console.error('استفاده: node scripts/bump-version.mjs X.Y.Z [--commit] [--tag] [--hub]');
  process.exit(1);
}
const OPT = {
  commit: process.argv.includes('--commit'),
  tag: process.argv.includes('--tag'),
  hub: process.argv.includes('--hub'),
};
/** فایل‌های اضافه برای ضمیمه‌شدن به کامیت: --with <path> (قابل تکرار) */
const EXTRA_PATHS = process.argv.flatMap((a, i) => (a === '--with' && process.argv[i + 1] ? [process.argv[i + 1]] : []));

const read = (p) => readFileSync(p, 'utf8');
const write = (p, s) => writeFileSync(p, s);

// --- ورژن فعلی از package.json ریشه ---
const current = JSON.parse(read('package.json')).version;
// اجرای دوباره با همان ورژن فقط برای ادامه‌ی مسیر (کامیت/تگ/هاب پس از تکمیل شرح‌ها) مجاز است
const isRecommit = current === NEW;
if (isRecommit && !OPT.commit && !OPT.tag && !OPT.hub) {
  console.error(`ورژن فعلی همین ${NEW} است — برای ادامه با فلگ --commit (و/یا --tag --hub) دوباره اجرا کنید.`);
  process.exit(1);
}
const cmp = [current, NEW].map((v) => v.split('.').map(Number));
const isNewer =
  cmp[0][0] > cmp[1][0] ? false : cmp[0][0] < cmp[1][0] ? true :
  cmp[0][1] > cmp[1][1] ? false : cmp[0][1] < cmp[1][1] ? true : cmp[0][2] < cmp[1][2];
if (!isRecommit && !isNewer) { console.error(`ورژن جدید (${NEW}) باید بالاتر از فعلی (${current}) باشد.`); process.exit(1); }

const TODAY = new Date().toISOString().slice(0, 10);
const replaced = [];
const patch = isRecommit
  ? () => {}
  : (name, file, fn) => {
  const before = read(file);
  const after = fn(before);
    if (after === before) { console.error(`  ✖ ${file}: الگوی «${name}» پیدا نشد — دستی اصلاح کنید.`); process.exitCode = 1; return; }
    write(file, after);
    replaced.push(`${file} ✓ (${name})`);
  };

// --- ۱) package.json ها + lock (در اجرای دوباره رد می‌شود) ---
if (!isRecommit) for (const f of ['package.json', 'server/package.json', 'client/package.json'])
  patch(`"version": "${current}"`, f, (s) => s.replace(`"version": "${current}"`, `"version": "${NEW}"`));
if (!isRecommit) {
  execSync('npm install --package-lock-only --no-audit --no-fund', { stdio: 'ignore' });
  replaced.push('package-lock.json ✓ (npm install --package-lock-only)');
}

// --- ۲) README ---
patch('بج نسخه', 'README.md', (s) =>
  s.replace(`**نسخه‌ی فعلی: \`${current}\`**`, `**نسخه‌ی فعلی: \`${NEW}\`**`)
   .replace(/meysam8498\/support-equipment-management:(\d+\.\d+\.\d+)/g, (m, v) => (v === current ? m.replace(current, NEW) : m))
);
// درج ردیف جدید در «بالای» جدول — از ماژول مشترک با check-docs-sync (مقایسه‌ی عددی + مکان یکسان)
patch('ردیف تاریخچه', 'README.md', (s) =>
  insertRowUnderHead(s, '## 📋 تاریخچه‌ی نسخه‌ها', `| **${NEW}** | ${TODAY} | «شرح تغییرات این نسخه را اینجا بنویسید» |`) ?? s
);

// --- ۳) DOCKER_HUB_OVERVIEW ---
patch('بج نسخه image', 'DOCKER_HUB_OVERVIEW.md', (s) =>
  s.replace(`**نسخه‌ی فعلی image: \`${current}\`**`, `**نسخه‌ی فعلی image: \`${NEW}\`**`)
   .replace(`| \`latest\` | آخرین نسخه‌ی پایدار (v${current}) |`, `| \`latest\` | آخرین نسخه‌ی پایدار (v${NEW}) |`)
);
patch('جدول تگ‌ها', 'DOCKER_HUB_OVERVIEW.md', (s) =>
  insertRowUnderHead(s, '## 🏷️ تگ‌های موجود', `| \`${NEW}\` | «شرح تگ جدید را اینجا بنویسید» |`) ?? s
);
patch('تاریخچه هاب', 'DOCKER_HUB_OVERVIEW.md', (s) =>
  insertRowUnderHead(s, '## 🗂️ تاریخچه‌ی نسخه‌ها', `| **${NEW}** | «شرح تغییرات این نسخه را اینجا بنویسید» |`) ?? s
);

// --- ۳.۵) فایل‌های دسکتاپ (Tauri) — همگام با ریشه ---
if (!isRecommit) {
  try { execSync(`node scripts/set-version.mjs ${NEW}`, { stdio: 'inherit' }); replaced.push('desktop/* ✓ (set-version.mjs)'); }
  catch { console.error('  ✖ set-version.mjs شکست خورد — دستی همگام کنید.'); process.exitCode = 1; }
}

// --- ۴) Dockerfile + compose ---
patch('ARG APP_VERSION', 'Dockerfile', (s) => s.replace(`ARG APP_VERSION=${current}`, `ARG APP_VERSION=${NEW}`));
patch('هدر داکرفایل', 'Dockerfile', (s) => s.replace(`# نسخه: ${current} (پیش‌فرض؛ در CI از تگ گیت با ARG APP_VERSION پر می‌شود)`, `# نسخه: ${NEW} (پیش‌فرض؛ در CI از تگ گیت با ARG APP_VERSION پر می‌شود)`));
patch('هدر compose', 'docker-compose.yml', (s) => s.replace(`# نسخه: ${current}`, `# نسخه: ${NEW}`));

if (!isRecommit) {
  console.log(`\n↑ ورژن: ${current} → ${NEW}`);
  for (const r of replaced) console.log('  • ' + r);
}

// --- ۵) چک همگام‌سازی (تا ویرایش دستی شرح‌های placeholder انجام شود، قرمز می‌ماند) ---
console.log('\n— اجرای چک همگام‌سازی...');
let checkOk = true;
try { execSync('node scripts/check-docs-sync.mjs', { stdio: 'inherit' }); } catch { checkOk = false; }

// شرح‌های جای‌نویز نباید داخل کامیت/تگ بروند — پیش از هر اقدام متوقف شو
// (فقط متن دقیق جای‌نویز چک می‌شود، نه عبارت عمومی که در راهنمای README هم هست)
const PLACEHOLDER_TEXTS = ['«شرح تغییرات این نسخه را اینجا بنویسید»', '«شرح تگ جدید را اینجا بنویسید»'];
const hasPlaceholder = PLACEHOLDER_TEXTS.some((p) => read('README.md').includes(p) || read('DOCKER_HUB_OVERVIEW.md').includes(p));
if (!checkOk || hasPlaceholder) {
  if (hasPlaceholder) {
    console.log('\n✖ شرح‌های جای‌نویز («… را اینجا بنویسید») هنوز در README/DOCKER_HUB_OVERVIEW هستند:');
    console.log('  ۱) ردیف‌های جدید تاریخچه را با شرح واقعی تغییرات این نسخه پر کنید.');
    console.log(`  ۲) دوباره اجرا کنید: node scripts/bump-version.mjs ${NEW} --commit${OPT.tag ? ' --tag' : ''}${OPT.hub ? ' --hub' : ''}`);
  } else {
    console.log('\n→ چک همگام‌سازی قرمز است — ناهمگونی‌های بالا را اصلاح کنید.');
  }
  process.exit(2);
}

// --- ۶) کامیت / تگ / هاب (فقط وقتی چک سبز و شرح‌ها واقعی است) ---
const FILES = ['package.json', 'server/package.json', 'client/package.json', 'package-lock.json', 'README.md', 'DOCKER_HUB_OVERVIEW.md', 'Dockerfile', 'docker-compose.yml', 'desktop/package.json', 'desktop/src-tauri/Cargo.toml', 'desktop/src-tauri/tauri.conf.json', 'desktop/src-tauri/tauri.support.conf.json'];
const summary = `ورژن ${NEW}`;
if (OPT.commit) {
  const allFiles = [...FILES, ...EXTRA_PATHS];
  execSync(`git add ${allFiles.join(' ')}`, { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): ${summary} — bump نسخه و مستندات\n\n🤖 Generated with Codebuff\nCo-Authored-By: Codebuff <noreply@codebuff.com>"`, { stdio: 'inherit' });
  console.log('✓ کامیت ساخته شد (push: git push origin master)');
}
if (OPT.tag) {
  execSync(`git tag v${NEW}`, { stdio: 'inherit' });
  console.log(`✓ تگ v${NEW} ساخته شد (برای پابلیش خودکار: git push origin v${NEW})`);
}
if (OPT.hub) {
  try {
    // توکن هاب فقط در حافظه می‌ماند و چاپ نمی‌شود
    const cred = execSync('printf "https://index.docker.io/v1/" | docker-credential-desktop get', { encoding: 'utf8', shell: 'bash' });
    const dpass = JSON.parse(cred).Secret;
    const login = execSync(
      `curl -s -H "Content-Type: application/json" -d "{\\"username\\":\\"meysam8498\\",\\"password\\":\\"$DPASS\\"}" https://hub.docker.com/v2/users/login/`,
      { encoding: 'utf8', env: { ...process.env, DPASS: dpass } }
    );
    const jwt = JSON.parse(login).token;
    const payload = `${process.env.TEMP}/hub_bump_payload.json`;
    execSync(
      `node -e "const fs=require('fs');const md=fs.readFileSync('DOCKER_HUB_OVERVIEW.md','utf8');fs.writeFileSync(process.env.TEMP+'/hub_bump_payload.json',JSON.stringify({description:'مدیریت تجهیزات، قطعات یدکی، گارانتی و تأمین — فارسی RTL',full_description:md}))"`,
      { stdio: 'ignore' }
    );
    const resp = execSync(
      `curl -s -o /dev/null -w "%{http_code}" -X PATCH "https://hub.docker.com/v2/repositories/meysam8498/support-equipment-management/" -H "Authorization: JWT $HUBJWT" -H "Content-Type: application/json" --data-binary "@${payload}"`,
      { encoding: 'utf8', env: { ...process.env, HUBJWT: jwt } }
    );
    console.log(resp === '200' ? '✓ Overview هاب Docker Hub همگام شد.' : `⚠ PATCH هاب: HTTP ${resp}`);
  } catch (e) {
    console.log('⚠ آپدیت خودکار هاب ناموفق بود — دستی همگام کنید:', String(e.message).split('\n')[0]);
  }
}

console.log('\n✔ همه‌چیز همگام است.');
if (OPT.commit) console.log('→ بعدی: git push origin master' + (OPT.tag ? ` && git push origin v${NEW}` : ''));
