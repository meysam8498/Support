#!/usr/bin/env node
// ============================================================
// smoke-test — تست خودکار لایسنس و سقف تجهیزات (قابل اجرا روی هر ریلیز)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// استفاده:
//   node scripts/smoke-test.mjs                          # localhost:4000؛ اگر سروری نبود خودش سرور temp بالا می‌آورد
//   BASE=http://localhost:4000 node scripts/smoke-test.mjs   # روی سرور در حال اجرا
//   # چرخه‌ی کامل کد لایسنس: صدور خودکار + بررسی/فعال‌سازی/replay/جعلی (مناسب پیش از release):
//   node scripts/smoke-test.mjs --issue [--plan year] [--code-days 1] [--grouped]
//   # با کد لایسنس آماده (تست فعال‌سازی — پایان تست، وضعیت برمی‌گردد):
//   node scripts/smoke-test.mjs --code-file path/to/code.txt
//   # با کاربر غیر از پیش‌فرض:
//   ADMIN_USER=admin ADMIN_PASS=admin123 node scripts/smoke-test.mjs
// ----------------------------------------------------------------
// چه چیزی را چک می‌کند:
//   ۱) GET /api/health و /api/version
//   ۲) GET /api/license و /api/license/device-limit (بدون 500 — رگرسیون schema)
//   ۳) POST /api/devices تا سقف (با TRIAL_LIMIT_ENFORCE=1 سرور) → مورد s+1 باید 402
//      با پیام ارتقا بدهد (متن دقیق باید عیناً با کلاینت هم‌واژه باشد)؛ بعد از ارتقا به طرح
//      پرداختی همان درخواست باید 201 شود
//   ۴) چرخه‌ی کد لایسنس: با --issue صدور واقعی با make-license-code (کلید فروشنده)
//      + تأیید امضا با --verify → code-status ✓ / activate 201 / replay 409 / جعلی 400
//      / ابطال و لغو ابطال — یا با --code-file/LICENSE_CODE کد آماده
//   ۵) برگشت وضعیت اولیه (طرح قبلی + حذف تجهیزات ساخته‌شده در تست)
// خروجی: ✓/✗ گام‌به‌گام + کد خروج 0/1 (مناسب CI و اجرای پیش از publish)
// ============================================================

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

let BASE = (process.env.BASE || 'http://localhost:4000').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const argv = process.argv.slice(2);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** متن ۴۰۲ از منبع واحد مشترک (shared/app-strings.json) — سرور و کلاینت هر دو از همین می‌خوانند */
const SHARED_STRINGS = JSON.parse(readFileSync(join(ROOT, 'shared', 'app-strings.json'), 'utf8'));
const UPGRADE_402_FALLBACK = SHARED_STRINGS.license.upgrade402;

// ─────────── سرور موقت — اگر سروری در BASE نبود، مثل logs-test خودش بالا می‌آید ───────────
let tempServer = null;
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SERVER_ENTRY = join(ROOT, 'server', 'src', 'index.ts');
const TEMP_PORT = 4139;

async function tryHealth(base, timeoutMs = 1500) {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

if (!(await tryHealth(BASE))) {
  console.log(`  ℹ سروری در ${BASE} نیست — سرور موقت روی پورت ${TEMP_PORT} بالا می‌آید (در پایان خاموش و پاک می‌شود).`);
  const dir = mkdtempSync(join(tmpdir(), 'smoke-test-'));
  const proc = spawn(process.execPath, [TSX, SERVER_ENTRY], {
    env: { ...process.env, DB_PATH: join(dir, 'app.db'), BACKUP_DIR: join(dir, 'bk'), PORT: String(TEMP_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = [];
  proc.stdout.on('data', (d) => out.push(d));
  proc.stderr.on('data', (d) => out.push(d));
  process.on('exit', () => { try { proc.kill(); } catch { /* بی‌صدا */ } });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      console.error(`✗ سرور موقت زود بسته شد:\n${out.join('').slice(-600)}`);
      rmSync(dir, { recursive: true, force: true });
      process.exit(1);
    }
    if (await tryHealth(`http://localhost:${TEMP_PORT}`, 1200)) { up = true; break; }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!up) {
    console.error('✗ سرور موقت ظرف ۶۰ ثانیه بالا نیامد.');
    try { proc.kill(); } catch { /* بی‌صدا */ }
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
  BASE = `http://localhost:${TEMP_PORT}`;
  tempServer = { proc, dir };
}

// کد لایسنس برای گام فعال‌سازی — --issue (صدور خودکار) / فایل / ENV
let LICENSE_CODE = process.env.LICENSE_CODE || '';
let issuedMeta = null; // { jti, plan, note } برای گزارش
const flagVal = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
if (argv.includes('--issue')) {
  // صدور واقعی با ابزار فروشنده — همان مسیری که در فروش واقعی می‌رود:
  // کلید خصوصی keys/license_private.pem لازم است (node scripts/make-license-code.mjs --gen-keys)
  const here = dirname(fileURLToPath(import.meta.url));
  const plan = flagVal('--plan') || 'year';
  const codeDays = flagVal('--code-days') || '1';
  const wantGrouped = argv.includes('--grouped');
  const note = `smoke-test-${new Date().toISOString().slice(0, 19)}`;
  const out = execFileSync('node', [
    join(here, 'make-license-code.mjs'),
    '--plan', plan,
    '--to', 'Smoke Test Issuer',
    '--email', 'smoke-test@localhost',
    '--note', note,
    '--code-days', codeDays,
  ], { encoding: 'utf8', cwd: process.cwd() });
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  // خط کد = تنها خطی که شکل JWT دارد (سه بخش با نقطه) — خطوط جداکننده‌ی ─── را رد می‌کند
  const plain = lines.find((l) => l.length > 50 && l.split('.').length === 3 && /^[A-Za-z0-9_.+-]+$/.test(l));
  if (!plain) { console.error('  ✗ خروجی صدور قابل خواندن نبود.'); process.exit(1); }
  const metaLine = lines.find((l) => l.startsWith('jti:'));
  issuedMeta = { jti: metaLine?.match(/jti:\s*(\S+)/)?.[1] ?? '?', plan, note };
  console.log(`  ℹ کد صادر شد: plan=${plan} · jti=${issuedMeta.jti} · ${wantGrouped ? 'grouped (+) · ' : ''}code-days=${codeDays}`);
  // تأیید محلی امضا با همان ابزار (بدون سرور) — روی کد خام (بدون گروه‌بندی)
  const ver = execFileSync('node', [join(here, 'make-license-code.mjs'), '--verify', plain], { encoding: 'utf8' });
  if (!ver.includes('"signature_ok": true')) { console.error('  ✗ امضای کد صادرشده محلی تأیید نشد — کلیدها را چک کنید.'); process.exit(1); }
  console.log('  ✓ امضای محلی (--verify) تأیید شد');
  // گروه‌بندی محلی با همان الگوی ابزار (بلوک‌های ۲۴ نویسه + جداکننده‌ی +) — سرور آن را می‌شناسد
  LICENSE_CODE = wantGrouped
    ? plain.split('.').map((seg) => (seg.match(/.{1,24}/g) || [seg]).join('+')).join('.')
    : plain;
} else if (argv.includes('--code-file')) {
  const f = flagVal('--code-file');
  if (f) LICENSE_CODE = readFileSync(f, 'utf8').trim();
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function api(method, path, { token, body, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* بدنه غیر JSON */ }
  return { status: res.status, data };
}

console.log(`\n🧪 Smoke test — ${BASE}\n${'─'.repeat(60)}`);

// ─────────── ورود ───────────
const login = await api('POST', '/api/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } });
if (login.status !== 200 || !login.data?.token) {
  console.error(`✗ ورود ناموفق (${login.status}) — ADMIN_USER/ADMIN_PASS را چک کنید.`);
  process.exit(1);
}
const TOKEN = login.data.token;
console.log('  ✓ ورود موفق');

// ─────────── ۱) سلامت و ورژن ───────────
console.log('\n— سلامت و وضعیت پایه');
const health = await api('GET', '/api/health');
ok('GET /api/health → 200', health.status === 200 && health.data?.ok === true);
const version = await api('GET', '/api/version');
ok('GET /api/version → ورژن معتبر', version.status === 200 && /^\d+\.\d+\.\d+$|^dev$/.test(version.data?.version ?? ''), JSON.stringify(version.data));

// ─────────── ۱.۵) endpoint لاگ سرور /api/logs — تطبیقی (۱.۲۷) ───────────
// smoke-test ممکن است به سرور SUPPORT_ONLY یا سرور عادی وصل شود — هر دو مسیر درست چک می‌شود.
// توکن لاگ: SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN (همان که سرور با آن مقایسه می‌کند).
console.log('\n— لاگ سرور /api/logs');
const LOG_TOKEN = process.env.SUPPORT_LOG_TOKEN || process.env.SUPPORT_TOKEN || '';
const isSupportOnly = version.data?.support_only === true;
if (isSupportOnly) {
  if (!LOG_TOKEN) console.log('  ℹ SUPPORT_LOG_TOKEN/SUPPORT_TOKEN تنظیم نشده — فقط رفتار ۴۰۱ چک می‌شود.');
  const logNo = await api('GET', '/api/logs');
  ok('لاگ: بدون هدر → 401', logNo.status === 401, `status=${logNo.status}`);
  const logBad = await api('GET', '/api/logs', { headers: { 'X-Support-Token': 'definitely-wrong' } });
  ok('لاگ: هدر غلط → 401', logBad.status === 401, `status=${logBad.status}`);
  if (LOG_TOKEN) {
    const logOk = await api('GET', '/api/logs?lines=5', { headers: { 'X-Support-Token': LOG_TOKEN } });
    ok('لاگ: توکن درست → 200', logOk.status === 200, `status=${logOk.status}`);
    ok('لاگ: شکل پاسخ (support_only/total/entries)', logOk.data?.support_only === true && typeof logOk.data?.total === 'number' && Array.isArray(logOk.data?.entries), JSON.stringify(logOk.data).slice(0, 100));
    ok('لاگ: حداکثر ۵ سطر با lines=5', logOk.data?.entries?.length <= 5, `n=${logOk.data?.entries?.length}`);
  }
} else {
  const logStd = await api('GET', '/api/logs', { headers: { 'X-Support-Token': 'whatever' } });
  ok('لاگ: سرور عادی → 404 (endpoint mount نشده)', logStd.status === 404, `status=${logStd.status}`);
}

// ─────────── ۲) درفت اسکیما (رگرسیون catalog_id: ستونی که در مهاجرت بود و از schema.sql جا افتاد) ───────────
// چک مستقل درون‌پردازشی — بدون سرور؛ همان منطق npm run check:schema با خروجی خلاصه
console.log('\n— درفت اسکیما (schema.sql در برابر مهاجرت‌ها)');
try {
  const { execFileSync: ex } = await import('node:child_process');
  const driftRoot = dirname(fileURLToPath(import.meta.url)) + '/..';
  ex(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'schema-drift-check.mjs')], { cwd: driftRoot, stdio: 'pipe' });
  ok('schema.sql پوشش کامل مهاجرت‌ها (بدون درفت)', true);
} catch (e) {
  const out = (e.stdout || '').toString().split('\n').filter((l) => l.includes('✗')).join('\n');
  ok('schema.sql پوشش کامل مهاجرت‌ها (بدون درفت)', false, out || e.message);
}

// ─────────── ۲ب) وضعیت لایسنس (رگرسیون 500 «no such table») ───────────
console.log('\n— وضعیت لایسنس');
const lic = await api('GET', '/api/license', { token: TOKEN });
ok('GET /api/license → 200 (نه 500)', lic.status === 200, `status=${lic.status} ${JSON.stringify(lic.data).slice(0, 120)}`);
ok('plan معتبر', ['trial', 'month', 'quarter', 'half-year', 'year', 'lifetime'].includes(lic.data?.plan), lic.data?.plan);
const prevPlan = lic.data?.plan;
const prevStarts = lic.data?.starts_at;
const prevExpires = lic.data?.expires_at;
const prevLicensedTo = lic.data?.licensed_to;
const prevNotes = lic.data?.notes;

const dl = await api('GET', '/api/license/device-limit', { token: TOKEN });
ok('GET /api/license/device-limit → 200', dl.status === 200, `status=${dl.status}`);
ok('ساختار device-limit درست', typeof dl.data?.used === 'number' && (dl.data?.limit === null || typeof dl.data?.limit === 'number'));
const limitBefore = dl.data?.limit;

// ─────────── ۳) سقف تجهیزات + 402 + ارتقا ───────────
// استراتژی: وضعیت فعلی enforce را می‌خوانیم؛ اگر سقف فعال است، تجهیز تا پر شدن
// می‌سازیم و 402 را چک می‌کنیم؛ سپس با ارتقا (PUT plan=month) آزاد شدن را می‌بینیم
// و در پایان طرح قبلی را برمی‌گردانیم و تجهیزات تست را حذف می‌کنیم.
console.log('\n— سقف تجهیزات و 402/ارتقا');
const created = []; // idهای ساخته‌شده برای پاک‌سازی

const lists = await api('GET', '/api/lists', { token: TOKEN });
const pid = lists.data?.projects?.[0]?.id;
const tid = lists.data?.deviceTypes?.[0]?.id;
const mid = lists.data?.deviceModels?.[0]?.id;
const bid = lists.data?.brands?.[0]?.id;
if (!pid || !tid || !mid || !bid) {
  console.log('  ⚠ لیست‌ها خالی‌اند — بخش سقف رد شد (ابتدا از UI پروژه/مدل/برند بسازید).');
} else {
  const body = { project_id: pid, device_type_id: tid, device_model_id: mid, brand_id: bid };
  const enforceActive = !!dl.data?.enforce && typeof limitBefore === 'number';
  let saw402 = false;
  if (enforceActive) {
    // پر کردن سقف (حداکثر limit + ۲ تلاش)
    const capacity = Math.max(0, limitBefore - (dl.data?.used ?? 0));
    for (let i = 0; i <= capacity; i++) {
      const r = await api('POST', '/api/devices', { token: TOKEN, body });
      if (r.status === 201 && r.data?.id) created.push(r.data.id);
      if (r.status === 402) {
        saw402 = true;
        ok('POST بعد از سقف → 402', true);
        ok('پیام ارتقا = متن دقیق کلاینت', r.data?.error === UPGRADE_402_FALLBACK, `دریافتی: ${JSON.stringify(r.data?.error)} / انتظار: ${JSON.stringify(UPGRADE_402_FALLBACK)}`);
        ok('upgrade:true + limit/used', r.data?.upgrade === true && typeof r.data?.limit === 'number');
        break;
      }
    }
    ok('402 واقعاً رخ داد', saw402, 'سقف هرگز پر نشد؟');
  } else {
    console.log('  ℹ TRIAL_LIMIT_ENFORCE فعال نیست (فقط گزارش) — یک تجهیز تست می‌سازیم و 402 را skip می‌کنیم.');
  }
  // یک تجهیز برای چک 201 (وقتی سقف فعال و پر نشده، این همان capacity اول است)
  // روی سرور پشتیبانی (SUPPORT_ONLY) ثبت تجهیز طبق طراحی 403 می‌دهد — بجای fail، همین رفتار چک می‌شود.
  if (!enforceActive) {
    const r = await api('POST', '/api/devices', { token: TOKEN, body });
    if (isSupportOnly) {
      ok('SUPPORT_ONLY: POST /api/devices → 403 (گیت پشتیبانی)', r.status === 403 && r.data?.support_only === true, `status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
    } else {
      ok('POST /api/devices → 201', r.status === 201, `status=${r.status}`);
      if (r.data?.id) created.push(r.data.id);
    }
  }
}

// ارتقا → سقف برداشته می‌شود (اگر trial هستیم) — فقط با کد لایسنس (گیت ۱.۲۳)
// بدون کد: PUT باید 403 بدهد؛ با کد صادرشده: فعال‌سازی و برداشتن سقف
if (prevPlan === 'trial') {
  const blocked = await api('PUT', '/api/license', { token: TOKEN, body: { plan: 'month', licensed_to: 'smoke-test' } });
  ok('ارتقای بدون کد → 403 (گیت لایسنس)', blocked.status === 403 && blocked.data?.license_required === true, `status=${blocked.status} ${JSON.stringify(blocked.data).slice(0, 100)}`);
  const extBlocked = await api('POST', '/api/license/extend', { token: TOKEN, body: { months: 3 } });
  ok('تمدید روی trial → 403', extBlocked.status === 403, `status=${extBlocked.status}`);

  if (LICENSE_CODE) {
    // ارتقای واقعی با فعال‌سازی کد (کد در گام بعدی فعال می‌شود؛ ترتیب: ابتدا کد را فعال می‌کنیم)
    // — اما گام ۴ ترتیب را حفظ می‌کند؛ اینجا اگر کد داریم، همان‌جا ارتقا چک می‌شود.
    console.log('  ℹ ارتقای واقعی با کد در گام «فعال‌سازی کد لایسنس» چک می‌شود.');
  }
} else {
  console.log('  ℹ طرح فعلی trial نیست — تست ارتقا skip شد.');
}

// ─────────── ۴) فعال‌سازی کد لایسنس (اختیاری — فقط با کد واقعی) ───────────
console.log('\n— فعال‌سازی کد لایسنس');
if (LICENSE_CODE) {
  const cs = await api('POST', '/api/license/code-status', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('code-status → valid:true', cs.status === 200 && cs.data?.valid === true, JSON.stringify(cs.data).slice(0, 120));
  if (issuedMeta) {
    ok('محتوای کد صادرشده سالم رسید (plan/jti/note)', cs.data?.plan === issuedMeta.plan && cs.data?.jti === issuedMeta.jti && String(cs.data?.note ?? '').startsWith('smoke-test-'), JSON.stringify({ plan: cs.data?.plan, jti: cs.data?.jti }));
  }
  const act = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('activate → 201 (یا 409 اگر قبلاً استفاده شده)', act.status === 201 || (act.status === 409 && act.data?.already_used === true), `status=${act.status}`);
  const replay = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('replay → 409', replay.status === 409, `status=${replay.status}`);
  const fake = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: 'eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiJGIiwicGxhbiI6InllYXIifQ.ZmFrZQ' } });
  ok('کد جعلی → 400', fake.status === 400, `status=${fake.status}`);
  const acts = await api('GET', '/api/license/activations', { token: TOKEN });
  ok('GET /activations → 200 آرایه', acts.status === 200 && Array.isArray(acts.data));

  // اگر trial هستیم: بعد از فعال‌سازی کد، سقف باید برداشته شده باشد (گیت ۱.۲۳: ارتقا فقط با کد)
  if (prevPlan === 'trial') {
    const dl2 = await api('GET', '/api/license/device-limit', { token: TOKEN });
    ok('بعد از فعال‌سازی کد limit=null', dl2.data?.limit === null && dl2.data?.is_trial === false, JSON.stringify(dl2.data).slice(0, 120));
    if (pid) {
      const r2 = await api('POST', '/api/devices', { token: TOKEN, body: { project_id: pid, device_type_id: tid, device_model_id: mid, brand_id: bid } });
      ok('افزودن بعد از فعال‌سازی → 201', r2.status === 201, `status=${r2.status}`);
      if (r2.data?.id) created.push(r2.data.id);
    }
  }

  // ابطال (۱.۱۹): jti ناشناخته هم پذیرفته می‌شود (سناریوی سرقت کدِ فعال‌نشده)
  const bogus = await api('POST', '/api/license/revoke', { token: TOKEN, body: { jti: 'NOPE-1234' } });
  ok('revoke jti نامعلوم → 200 با known:false', bogus.status === 200 && bogus.data?.known === false, `status=${bogus.status} ${JSON.stringify(bogus.data).slice(0, 80)}`);
  const empty = await api('POST', '/api/license/revoke', { token: TOKEN, body: {} });
  ok('revoke بدون ورودی → 400', empty.status === 400, `status=${empty.status}`);
  // چرخه‌ی کامل ابطال/لغو ابطال روی jti کد واقعی
  const csJti = cs.data?.jti;
  if (csJti) {
    const rev = await api('POST', '/api/license/revoke', { token: TOKEN, body: { jti: csJti } });
    ok('revoke → ok:true', rev.status === 200 && rev.data?.ok === true && rev.data?.known === true, `status=${rev.status} ${JSON.stringify(rev.data).slice(0, 80)}`);
    const list = await api('GET', '/api/license/revoked', { token: TOKEN });
    ok('GET /revoked شامل jti', list.status === 200 && Array.isArray(list.data?.jtis) && list.data.jtis.includes(csJti), JSON.stringify(list.data).slice(0, 80));
    const unrevoke = await api('POST', '/api/license/unrevoke', { token: TOKEN, body: { jti: csJti } });
    ok('unrevoke → revoked:false', unrevoke.status === 200 && unrevoke.data?.revoked === false, `status=${unrevoke.status}`);
  }
} else {
  console.log('  ℹ بدون --code-file/«LICENSE_CODE» — تست فعال‌سازی کد skip شد.');
}

// ─────────── ۴ب) ساخت کاربر + بازنشانی رمز — هم‌نامی فیلد سرور/کلاینت (رگرسیون db9afcf) ───────────
// بدنه‌ها عیناً همان فیلدهایی که کلاینت (UsersPage) می‌فرستد: create {username,password,full_name,email,role}
// و بازنشانی {new_password} — رگرسیون ناهم‌نامی (سرور «password» می‌خواست) دیگر بی‌صدا تکرار نمی‌شود.
console.log('\n— ساخت کاربر و بازنشانی رمز (هم‌نامی سرور/کلاینت)');
const newUsername = 'smoke-user';
const createdUser = await api('POST', '/api/users', {
  token: TOKEN,
  body: { username: newUsername, password: 'smoke-pass-1', full_name: 'کاربر آزمون smoke', email: '', role: 'viewer' },
});
ok('POST /api/users → 201 (بدنه‌ی عین کلاینت)', createdUser.status === 201 && typeof createdUser.data?.id === 'number', `status=${createdUser.status} ${JSON.stringify(createdUser.data).slice(0, 120)}`);
const uid = createdUser.data?.id;

const shortPass = await api('POST', '/api/users', {
  token: TOKEN,
  body: { username: 'smoke-short', password: 'abc', full_name: 'کوتاه', role: 'viewer' },
});
ok('رمز کوتاه → 400 با پیام منبع واحد', shortPass.status === 400 && shortPass.data?.error === SHARED_STRINGS.credentials.msgPasswordShort, `status=${shortPass.status} ${JSON.stringify(shortPass.data).slice(0, 120)}`);

if (uid) {
  const loginNew = await api('POST', '/api/auth/login', { body: { username: newUsername, password: 'smoke-pass-1' } });
  ok('ورود کاربر تازه → 200', loginNew.status === 200 && !!loginNew.data?.token, `status=${loginNew.status}`);

  const reset = await api('POST', `/api/users/${uid}/reset-password`, { token: TOKEN, body: { new_password: 'smoke-pass-2' } });
  ok('بازنشانی رمز با new_password → 200', reset.status === 200, `status=${reset.status} ${JSON.stringify(reset.data).slice(0, 120)}`);

  const loginReset = await api('POST', '/api/auth/login', { body: { username: newUsername, password: 'smoke-pass-2' } });
  ok('ورود با رمز جدید → 200', loginReset.status === 200 && !!loginReset.data?.token, `status=${loginReset.status}`);
  const loginOld = await api('POST', '/api/auth/login', { body: { username: newUsername, password: 'smoke-pass-1' } });
  ok('رمز قدیمی → 401', loginOld.status === 401, `status=${loginOld.status}`);

  const delUser = await api('DELETE', `/api/users/${uid}`, { token: TOKEN });
  ok('حذف کاربر آزمون', delUser.status === 200 || delUser.status === 404, `status=${delUser.status}`);
}

// ─────────── ۵) برگشت وضعیت اولیه ───────────
console.log('\n— پاک‌سازی و برگشت وضعیت');
if (prevPlan === 'trial') {
  const back = await api('PUT', '/api/license', {
    token: TOKEN,
    body: { plan: 'trial', starts_at: prevStarts ?? undefined, expires_at: prevExpires ?? null, licensed_to: prevLicensedTo, notes: prevNotes },
  });
  ok('برگشت طرح به trial', back.status === 200 && back.data?.plan === 'trial', `status=${back.status}`);
} else if (prevPlan && prevPlan !== lic.data?.plan) {
  const back = await api('PUT', '/api/license', {
    token: TOKEN,
    body: { plan: prevPlan, starts_at: prevStarts ?? undefined, expires_at: prevExpires ?? null, licensed_to: prevLicensedTo, notes: prevNotes },
  });
  ok(`برگشت طرح به ${prevPlan}`, back.status === 200, `status=${back.status}`);
}
let delOk = 0, delFail = 0;
for (const id of created) {
  const d = await api('DELETE', `/api/devices/${id}`, { token: TOKEN });
  if (d.status === 200 || d.status === 404) delOk++; else delFail++;
}
ok(`حذف تجهیزات تست (${created.length} عدد)`, delFail === 0, `${delFail} ناموفق`);

// ─────────── جمع‌بندی ───────────
console.log('\n' + '─'.repeat(60));
console.log(`${fail === 0 ? '✅' : '❌'} نتیجه: ${pass} موفق، ${fail} ناموفق\n`);
// خاموشی و پاک‌سازی سرور موقت (اگر خودمان بالا آورده باشیم)
if (tempServer) {
  try { tempServer.proc.kill(); } catch { /* بی‌صدا */ }
  try { rmSync(tempServer.dir, { recursive: true, force: true }); } catch { /* بی‌صدا */ }
  console.log('ℹ سرور موقت خاموش و پاک شد.');
}
process.exit(fail === 0 ? 0 : 1);
