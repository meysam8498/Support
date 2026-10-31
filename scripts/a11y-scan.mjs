// ============================================================
// اسکن زنده‌ی دسترس‌پذیری — npm run a11y:scan
// ------------------------------------------------------------
// همه‌ی مسیرهای اپ در مرورگر واقعی (Chrome سیستم، از طریق puppeteer-core)
// با axe-core (همان نسخه‌ای که تست‌های jsdom استفاده می‌کنند) سنجیده می‌شوند:
//   • تم: تاریک + روشن (پیش‌فرض؛ --theme dark یا light برای تک‌تا)
//   • عرض: موبایل ۳۹۰ (پیش‌فرض؛ --width 1280 یا --width 390,1280 برای چند عرض)
//   • لاگین واقعی با حساب ادمین (ADMIN_USERNAME/ADMIN_PASSWORD؛ پیش‌فرض admin/admin123)
//   • شناسه‌های داده (تجهیز/قطعه/پروژه) از API خودِ سرور کشف می‌شوند
// خروجی: reports/a11y-scan/REPORT.md + latest.json و خلاصه‌ی کنسول.
// خروجی exit: ۰ = گزارش‌دهی (even با نقض)؛ با --strict اگر نقضی باشد ۱ (برای CI).
//
// سرعت/محدودیت نرخ: سرور licenseLimiter دارد (۳۰ درخواست لایسنس/دقیقه روی هر IP) و هر صفحه
// چند درخواست لایسنس می‌زند (بج لایسنس + کارت داشبورد). برای همین اسکن صفحه‌به‌صفحه مکث
// می‌کند (--delay، پیش‌فرض ۱۳۰۰ms). اگر 429 دیدید، --delay را بالا ببرید؛ آن 429 نویزِ سرعتِ
// اسکن است نه عیب اپ. سقف واقعی لایسنس را scripts/a11y-scan.mjs تعیین نمی‌کند.
//
// نویزهای حذف‌شده در گزارش: favicon.ico (درخواست پیش‌فرض مرورگر) و «Failed to load resource»
// (آینه‌ی کنسولیِ پاسخ‌های HTTP که response listener قبلاً ثبت کرده).
//
// پیش‌نیاز: سرور (4000) و کلاینت Vite (5173) بالا باشند — npm run dev
// تنظیم مرورگر: A11Y_CHROME=/path/to/chrome (پیش‌فرض: Chrome/Edge سیستم)
// ============================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import puppeteer from 'puppeteer-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLIENT = process.env.A11Y_CLIENT || 'http://localhost:5173';
const API = process.env.A11Y_API || 'http://localhost:4000';
const AXE_PATH = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
const OUT_DIR = join(ROOT, 'reports', 'a11y-scan');

// ─────────── آرگومان‌های خط فرمان ───────────
function parseArgs(argv) {
  const args = { theme: 'both', width: '390', strict: false, only: '', delay: 1300 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') args.strict = true;
    else if (a === '--theme') args.theme = argv[++i];
    else if (a === '--width') args.width = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--delay') args.delay = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: npm run a11y:scan -- [--theme light|dark|both] [--width 390|1280|390,1280] [--only substr] [--delay ms] [--strict]`);
      process.exit(0);
    } else throw new Error(`آرگومان ناشناخته: ${a}`);
  }
  const themes = args.theme === 'both' ? ['light', 'dark'] : [args.theme];
  if (!themes.every((t) => t === 'light' || t === 'dark')) throw new Error(`--theme باید light|dark|both باشد: ${args.theme}`);
  const widths = args.width.split(',').map((w) => Number(w.trim())).filter(Boolean);
  if (!widths.length || widths.some((w) => w < 240 || w > 3840)) throw new Error(`--width نامعتبر: ${args.width}`);
  return { themes, widths, strict: args.strict, only: args.only, delay: args.delay };
}

// ─────────── پیداکردن Chrome/Edge سیستم (puppeteer-core مرورگر دانلود نمی‌کند) ───────────
function findChrome() {
  if (process.env.A11Y_CHROME) {
    if (!existsSync(process.env.A11Y_CHROME)) throw new Error(`A11Y_CHROME وجود ندارد: ${process.env.A11Y_CHROME}`);
    return process.env.A11Y_CHROME;
  }
  const candidates = platform() === 'win32'
    ? [
        join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : platform() === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome/Edge پیدا نشد — A11Y_CHROME را به مسیر مرورگر تنظیم کنید.');
  return found;
}

// ─────────── بررسی بالابودن سرور/کلاینت ───────────
async function assertServersUp() {
  const check = async (url, what) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      console.error(`✗ ${what} بالا نیست: ${url} (${e.message})\n  ابتدا 'npm run dev' را اجرا کنید و دوباره تلاش کنید.`);
      process.exit(2);
    }
  };
  await check(`${API}/api/health`, 'سرور API');
  await check(`${CLIENT}/`, 'کلاینت Vite');
}

// ─────────── لاگین واقعی + کشف شناسه‌های داده از API ───────────
async function login() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`لاگین ناموفق (${r.status}) با ${username} — ADMIN_USERNAME/ADMIN_PASSWORD را تنظیم کنید.`);
  const j = await r.json();
  if (!j.token) throw new Error('پاسخ لاگین توکن نداشت.');
  return { token: j.token, user: j.user };
}

async function discoverIds(token) {
  const get = async (path) => {
    const r = await fetch(`${API}/api${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    return r.ok ? r.json() : null;
  };
  const [devices, parts, lists] = await Promise.all([get('/devices?limit=1'), get('/parts?limit=1'), get('/lists')]);
  const device = Array.isArray(devices) && devices[0] ? devices[0].id : null;
  const part = Array.isArray(parts) && parts[0] ? parts[0].id : null;
  const project = lists && Array.isArray(lists.projects) && lists.projects[0] ? lists.projects[0].id : null;
  return { device, part, project };
}

// ─────────── فهرست مسیرها — همان درخت App.tsx (همه‌ی صفحات رندرشدنی) ───────────
function pageList(ids) {
  const d = ids.device ?? 1;
  const p = ids.part ?? 1;
  const c = ids.project ?? 1;
  return [
    { path: '/login', label: 'ورود' },
    { path: '/', label: 'داشبورد' },
    { path: '/devices', label: 'فهرست تجهیزات' },
    { path: '/devices/new', label: 'ثبت تجهیز جدید' },
    { path: `/devices/${d}`, label: 'جزئیات تجهیز' },
    { path: `/devices/${d}/edit`, label: 'ویرایش تجهیز' },
    { path: `/devices/${d}/parts-grid`, label: 'گرید قطعات تجهیز' },
    { path: '/parts', label: 'فهرست قطعات' },
    { path: '/parts/new', label: 'ثبت قطعه جدید' },
    { path: `/parts/${p}`, label: 'جزئیات قطعه' },
    { path: `/parts/${p}/edit`, label: 'ویرایش قطعه' },
    { path: '/warranty', label: 'تعویض‌های گارانتی' },
    { path: '/warranty/replace', label: 'ثبت تعویض گارانتی' },
    { path: '/reports', label: 'گزارش‌ها' },
    { path: '/lists', label: 'مدیریت لیست‌ها' },
    { path: '/serial-import', label: 'ورود سریال از اکسل' },
    { path: '/users', label: 'مدیریت کاربران' },
    { path: '/backups', label: 'مدیریت بکاپ‌ها' },
    { path: '/license', label: 'وضعیت لایسنس' },
    { path: '/issue', label: 'پنل ساخت لایسنس' },
    { path: '/about', label: 'درباره سامانه' },
    { path: '/logs', label: 'لاگ سرور' },
    { path: `/dashboard/customer/${c}`, label: 'نمای مشتری' },
  ];
}

// ─────────── یک اسکن: navigate → settle → axe + خطاهای JS/شبکه + سرریز افقی ───────────
async function scanPage(ctx, spec, theme, width) {
  const { browser, token, user, axeSource } = ctx;
  const tab = await browser.newPage();
  const netFailures = [];
  const throttled = [];
  const pageErrors = [];
  // favicon درخواست پیش‌فرض خودِ مرورگر است (نه اپ) — نویز است، فیلتر می‌شود
  const isNoise = (u) => u.endsWith('favicon.ico') || u.includes('favicon.ico');
  tab.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (isNoise(loc) || isNoise(m.text())) return;
    // «Failed to load resource» آینه‌ی کنسولیِ همان پاسخ HTTP است که response listener
    // بالا به‌طور قطعی ثبت می‌کند (و 429ها را جدا می‌کند) — ثبت دوباره فقط دو برابرشان می‌کند.
    if (m.text().startsWith('Failed to load resource')) return;
    pageErrors.push(m.text().slice(0, 300));
  });
  tab.on('pageerror', (e) => pageErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  tab.on('response', (r) => {
    const status = r.status();
    if (status < 400) return;
    const u = r.url();
    if (isNoise(u)) return;
    // ۴۰۴ِ GET /api/dashboard/layout رفتِ سالمِ نقطه‌شروع است (سد مسیری):
    // تا وقتی کاربر چیدمانی ذخیره نکرده، سرور عمداً ۴۰۴ می‌دهد و کلاینت DEFAULT_ORDER می‌آورد.
    // هر ۴۰۴ دیگری همچنان خطای واقعی است.
    if (status === 404 && u.includes('/api/dashboard/layout')) return;
    const path = u.replace(CLIENT, '');
    // 429 با هدر draft-7 خودِ سرور (RateLimit-*) = محدودیت نرخِ ذاتی سرور که اسکنِ سریع آن را
    // می‌شکند؛ عیب اپ نیست. جدا نگه داشته می‌شود تا گزارش دروغ نگوید. بدون هدر = 429 واقعی.
    const hdr = r.headers();
    const isRateLimited = status === 429 && (hdr['ratelimit-policy'] || hdr['ratelimit-remaining'] || hdr['retry-after']);
    (isRateLimited ? throttled : netFailures).push(`${status} ${path}`);
  });

  // snapshot همزمان با listener — خروجی نهایی بعد از settle گرفته می‌شود نه در finally
  const collect = () => ({
    netFailures: [...new Set(netFailures)],
    throttled: [...new Set(throttled)],
    pageErrors: [...new Set(pageErrors)],
  });

  try {
    await tab.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    // هویت + تم قبل از هر بارگذاری — اپ همان‌طور که کاربر واقعی بوت می‌شود بالا می‌آید
    await tab.evaluateOnNewDocument(({ t, u, th }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
      localStorage.setItem('theme', th);
    }, { t: token, u: user, th: theme });

    await tab.goto(`${CLIENT}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // صفحات lazy اول فالبک نشان می‌دهند — تا رندر واقعی + سکون شبکه صبر کن
    await tab.waitForFunction(() => !document.querySelector('[data-testid="page-loading"]'), { timeout: 15000 }).catch(() => {});
    await tab.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 250));

    const darkOk = await tab.evaluate((want) => document.documentElement.classList.contains('dark') === want, theme === 'dark');

    // سرریز افقی با آزمون رفتاری (scrollWidth در RTL دروغ می‌گوید — پنجره باید واقعاً اسکرول شود)
    const overflowX = await tab.evaluate(async () => {
      window.scrollTo(9999, 0);
      await new Promise((r) => setTimeout(r, 100));
      const canScroll = window.scrollX > 0;
      window.scrollTo(0, 0);
      return canScroll;
    });

    // axe — همان فایل محلی node_modules که تست‌های jsdom می‌خوانند
    await tab.evaluate(axeSource);
    const axeResult = await tab.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        resultTypes: ['violations'],
      });
      return r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), html: n.html.replace(/\s+/g, ' ').slice(0, 160) })),
        nodeCount: v.nodes.length,
      }));
    });

    return {
      path: spec.path, label: spec.label, theme, width,
      ok: true, darkOk,
      violations: axeResult,
      ...collect(),
      overflowX,
    };
  } catch (e) {
    return { path: spec.path, label: spec.label, theme, width, ok: false, error: String(e.message || e).slice(0, 300), violations: [], ...collect(), overflowX: false, darkOk: true };
  } finally {
    await tab.close().catch(() => {});
  }
}

// ─────────── گزارش markdown + JSON + خلاصه‌ی کنسول ───────────
function writeReports(results, meta) {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const bad = results.filter((r) => !r.ok || r.violations.length || r.pageErrors.length || r.netFailures.length || r.overflowX || !r.darkOk);
  const throttledCount = results.reduce((n, r) => n + (r.throttled?.length || 0), 0);

  const lines = [];
  lines.push(`# گزارش اسکن زنده‌ی دسترس‌پذیری (axe — مرورگر واقعی)`);
  lines.push('');
  lines.push(`- **زمان اجرا:** ${stamp} · **نسخه‌ی اپ:** ${meta.appVersion} · **axe:** ${meta.axeVersion} · **مرورگر:** ${meta.browser}`);
  lines.push(`- **سرور:** ${API} · **کلاینت:** ${CLIENT} · **تم‌ها:** ${meta.themes.join('، ')} · **عرض‌ها:** ${meta.widths.join('، ')}px`);
  lines.push(`- **صفحات:** ${meta.pageCount} × تم × عرض = ${results.length} اسکن · **بدون نقض:** ${results.length - bad.length} · **با مشکل:** ${bad.length}`);
  if (throttledCount) {
    lines.push(`- **محدودیت نرخ (نویزِ سرعتِ اسکن، عیب اپ نیست):** ${throttledCount} پاسخ 429 روی /api/license — سرور licenseLimiter دارد (۳۰ درخواست/دقیقه به ازای هر IP). برای حذفِ کامل، اجرا را با --delay بزرگ‌تر تکرار کنید.`);
  }
  lines.push('');
  lines.push('| صفحه | تم | عرض | نقض axe | خطای JS | خطای شبکه | سرریز افقی |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const mark = (n) => (n ? `❌ ${n}` : '✓');
    lines.push(`| ${r.label} (\`${r.path}\`) | ${r.theme} | ${r.width} | ${mark(r.violations.length)} | ${mark(r.pageErrors.length)} | ${mark(r.netFailures.length)} | ${r.overflowX ? '❌' : '✓'} |`);
  }
  if (bad.length) {
    lines.push('', '## جزئیات مشکلات', '');
    for (const r of bad) {
      lines.push(`### ${r.label} (\`${r.path}\`) — ${r.theme}/${r.width}px`);
      if (!r.ok) lines.push(`- ⚠️ **اسکن ناقص ماند:** ${r.error}`);
      if (!r.darkOk) lines.push('- ⚠️ کلاس `dark` بعد از بوت با تم خواسته‌شده هم‌خوان نبود.');
      for (const v of r.violations) {
        lines.push(`- **${v.id}** [${v.impact}] ×${v.nodeCount}: ${v.help}`);
        for (const n of v.nodes) lines.push(`  - \`${n.target}\` — ${n.html}`);
        lines.push(`  - راهنما: ${v.helpUrl}`);
      }
      for (const e of r.pageErrors) lines.push(`- خطای کنسول/JS: ${e}`);
      for (const f of r.netFailures) lines.push(`- پاسخ ناموفق شبکه: ${f}`);
      if (r.overflowX) lines.push('- سند در موبایل واقعاً افقی اسکرول می‌شود (سرریز واقعی، نه نویز RTL).');
      lines.push('');
    }
  } else {
    lines.push('', '🎉 هیچ مشکلی پیدا نشد.');
  }
  lines.push('');
  const md = lines.join('\n');
  writeFileSync(join(OUT_DIR, 'REPORT.md'), md, 'utf8');
  writeFileSync(join(OUT_DIR, 'latest.json'), JSON.stringify({ meta, results }, null, 2), 'utf8');

  // خلاصه‌ی کنسول
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`اسکن کامل: ${results.length} اسکن (${meta.pageCount} صفحه × ${meta.themes.length} تم × ${meta.widths.length} عرض) — ${results.length - bad.length} سالم، ${bad.length} با مشکل`);
  for (const r of bad) {
    const bits = [];
    if (r.violations.length) bits.push(`axe×${r.violations.length} (${r.violations.map((v) => v.id).join(', ')})`);
    if (r.pageErrors.length) bits.push(`JS×${r.pageErrors.length}`);
    if (r.netFailures.length) bits.push(`شبکه×${r.netFailures.length}`);
    if (r.overflowX) bits.push('سرریز افقی');
    if (!r.ok) bits.push(`اسکن ناقص: ${r.error}`);
    console.log(`  ❌ ${r.label} (${r.path}) [${r.theme}/${r.width}px] — ${bits.join(' · ')}`);
  }
  console.log(`گزارش: reports/a11y-scan/REPORT.md و latest.json`);
  return { badCount: bad.length };
}

// ─────────── اجرا ───────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(AXE_PATH)) throw new Error(`axe.min.js پیدا نشد: ${AXE_PATH} — ابتدا npm install`);
  const axeSource = readFileSync(AXE_PATH, 'utf8');
  const axeVersion = (axeSource.match(/version[:=]"?([\d.]+)"?/) || [])[1] || 'نامشخص';

  await assertServersUp();
  const { token, user } = await login();
  const ids = await discoverIds(token);
  if (!ids.device) console.log('⚠ دیتابیس تجهیزی ندارد — صفحات جزئیات با شناسه‌ی پیش‌فرض ۱ می‌روند.');
  let pages = pageList(ids);
  if (args.only) pages = pages.filter((p) => p.path.includes(args.only) || p.label.includes(args.only));
  if (!pages.length) throw new Error(`--only «${args.only}» هیچ صفحه‌ای را انتخاب نکرد.`);

  const executablePath = findChrome();
  console.log(`مرورگر: ${executablePath}`);
  console.log(`دامنه: ${pages.length} صفحه × ${args.themes.length} تم (${args.themes.join('/')}) × ${args.widths.length} عرض (${args.widths.join(', ')})`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  });
  try {
    // نسخه‌ی مرورگر برای گزارش
    const v = await browser.version();
    const ctx = { browser, token, user, axeSource };
    const results = [];
    // صفحه‌به‌صفحه با مکث — سرور licenseLimiter دارد (۳۰ درخواست/دقیقه روی هر IP)؛
    // اسکن پشت‌سرهم 429 می‌سازد که نویزِ سرعتِ اسکن است نه عیب اپ. مکث قابل تنظیم با --delay.
    for (const theme of args.themes) {
      for (const width of args.widths) {
        for (const spec of pages) {
          const r = await scanPage(ctx, spec, theme, width);
          const flag = r.ok && !r.violations.length && !r.pageErrors.length && !r.netFailures.length && !r.overflowX ? '✓' : '❌';
          process.stdout.write(`${flag}`);
          results.push(r);
          if (args.delay > 0) await new Promise((res) => setTimeout(res, args.delay));
        }
      }
    }
    process.stdout.write('\n');
    let appVersion = 'نامشخص';
    try { appVersion = (await (await fetch(`${API}/api/version`, { signal: AbortSignal.timeout(4000) })).json()).version || 'نامشخص'; } catch { /* */ }
    const { badCount } = writeReports(results, { themes: args.themes, widths: args.widths, pageCount: pages.length, appVersion, axeVersion, browser: v });
    if (args.strict && badCount > 0) {
      console.error(`--strict: ${badCount} اسکن مشکل داشت → exit 1`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message || e}`);
  process.exit(1);
});
