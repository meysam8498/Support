#!/usr/bin/env node
// ============================================================
// smoke-test — تست خودکار لایسنس و سقف تجهیزات (قابل اجرا روی هر ریلیز)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// استفاده:
//   node scripts/smoke-test.mjs                          # localhost:4000
//   BASE=http://localhost:4000 node scripts/smoke-test.mjs
//   # با کد لایسنس واقعی (تست فعال‌سازی — پایان تست، وضعیت برمی‌گردد):
//   node scripts/smoke-test.mjs --code-file path/to/code.txt
//   # با کاربر غیر از پیش‌فرض:
//   ADMIN_USER=admin ADMIN_PASS=admin123 node scripts/smoke-test.mjs
// ----------------------------------------------------------------
// چه چیزی را چک می‌کند:
//   ۱) GET /api/health و /api/version
//   ۲) GET /api/license و /api/license/device-limit (بدون 500 — رگرسیون schema)
//   ۳) POST /api/devices تا سقف (با TRIAL_LIMIT_ENFORCE=1 سرور) → مورد s+1 باید 402
//      با پیام ارتقا بدهد؛ بعد از ارتقا به طرح پرداختی همان درخواست باید 201 شود
//   ۴) فعال‌سازی کد: code-status ✓ / activate 201 / replay 409 / جعلی 400
//   ۵) برگشت وضعیت اولیه (طرح قبلی + حذف تجهیزات ساخته‌شده در تست)
// خروجی: ✓/✗ گام‌به‌گام + کد خروج 0/1 (مناسب CI و اجرای پیش از publish)
// ============================================================

import { readFileSync } from 'node:fs';

const BASE = (process.env.BASE || 'http://localhost:4000').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// کد لایسنس برای گام فعال‌سازی — از فایل یا ENV
let LICENSE_CODE = process.env.LICENSE_CODE || '';
if (process.argv.includes('--code-file')) {
  const f = process.argv[process.argv.indexOf('--code-file') + 1];
  if (f) LICENSE_CODE = readFileSync(f, 'utf8').trim();
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function api(method, path, { token, body } = {}) {
  const headers = {};
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

// ─────────── ۲) وضعیت لایسنس (رگرسیون 500 «no such table») ───────────
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
        ok('پیام ارتقای فارسی', typeof r.data?.error === 'string' && r.data.error.includes('ارتقا'), r.data?.error);
        ok('upgrade:true + limit/used', r.data?.upgrade === true && typeof r.data?.limit === 'number');
        break;
      }
    }
    ok('402 واقعاً رخ داد', saw402, 'سقف هرگز پر نشد؟');
  } else {
    console.log('  ℹ TRIAL_LIMIT_ENFORCE فعال نیست (فقط گزارش) — یک تجهیز تست می‌سازیم و 402 را skip می‌کنیم.');
  }
  // یک تجهیز برای چک 201 (وقتی سقف فعال و پر نشده، این همان capacity اول است)
  if (!enforceActive) {
    const r = await api('POST', '/api/devices', { token: TOKEN, body });
    ok('POST /api/devices → 201', r.status === 201, `status=${r.status}`);
    if (r.data?.id) created.push(r.data.id);
  }
}

// ارتقا → سقف برداشته می‌شود (اگر trial هستیم)
if (prevPlan === 'trial') {
  const up = await api('PUT', '/api/license', { token: TOKEN, body: { plan: 'month', licensed_to: 'smoke-test' } });
  ok('PUT plan=month → 200', up.status === 200, `status=${up.status}`);
  const dl2 = await api('GET', '/api/license/device-limit', { token: TOKEN });
  ok('بعد از ارتقا limit=null', dl2.data?.limit === null && dl2.data?.is_trial === false, JSON.stringify(dl2.data));
  const r2 = await api('POST', '/api/devices', {
    token: TOKEN,
    body: (pid)
      ? { project_id: pid, device_type_id: tid, device_model_id: mid, brand_id: bid }
      : undefined,
  });
  ok('افزودن بعد از ارتقا → 201', r2.status === 201, `status=${r2.status}`);
  if (r2.data?.id) created.push(r2.data.id);
} else {
  console.log('  ℹ طرح فعلی trial نیست — تست ارتقا skip شد.');
}

// ─────────── ۴) فعال‌سازی کد لایسنس (اختیاری — فقط با کد واقعی) ───────────
console.log('\n— فعال‌سازی کد لایسنس');
if (LICENSE_CODE) {
  const cs = await api('POST', '/api/license/code-status', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('code-status → valid:true', cs.status === 200 && cs.data?.valid === true, JSON.stringify(cs.data).slice(0, 120));
  const act = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('activate → 201 (یا 409 اگر قبلاً استفاده شده)', act.status === 201 || (act.status === 409 && act.data?.already_used === true), `status=${act.status}`);
  const replay = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: LICENSE_CODE } });
  ok('replay → 409', replay.status === 409, `status=${replay.status}`);
  const fake = await api('POST', '/api/license/activate', { token: TOKEN, body: { code: 'eyJhbGciOiJSUzI1NiJ9.eyJqdGkiOiJGIiwicGxhbiI6InllYXIifQ.ZmFrZQ' } });
  ok('کد جعلی → 400', fake.status === 400, `status=${fake.status}`);
  const acts = await api('GET', '/api/license/activations', { token: TOKEN });
  ok('GET /activations → 200 آرایه', acts.status === 200 && Array.isArray(acts.data));

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
process.exit(fail === 0 ? 0 : 1);
