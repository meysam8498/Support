#!/usr/bin/env node
// ============================================================
// logs-test — تست خودکار endpoint /api/logs در هر دو حالت سرور
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// استفاده:
//   node scripts/logs-test.mjs
//   PORT_SUP=4123 PORT_STD=4124 node scripts/logs-test.mjs
// ----------------------------------------------------------------
// چه چیزی را چک می‌کند:
//   ۱) سرور پشتیبانی (SUPPORT_ONLY=1 + SUPPORT_TOKEN):
//      • بدون هدر → 401 · هدر غلط → 401 · توکن ENV خالی هم 401
//      • GET با توکن → 200 و شکل پاسخ (support_only/version/total/entries)
//      • خطاها هم در لاگ می‌افتند: تحریک ۵۰۰ با JSON خراب → level:'error'
//      • پارامتر lines: پیش‌فرض ۱۰۰ · سقف ۲۰۰ · کف ۱ · مقدار نامعتبر → پیش‌فرض
//      • Cache-Control: no-store
//      • گیت SUPPORT_ONLY: /api/devices → 403 ولی /api/logs باز
//   ۲) سرور عادی (بدون SUPPORT_ONLY): /api/logs → 404 حتی با توکن درست
// خروجی: ✓/✗ گام‌به‌گام + کد خروج 0/1 — مناسب CI
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// tsx از node_modules/.bin ریشه (workspaces) — اجرای مستقیم cli.mjs بدون وابستگی به شِل
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SERVER_ENTRY = join(ROOT, 'server', 'src', 'index.ts');

const PORT_SUP = Number(process.env.PORT_SUP || 4123);
const PORT_STD = Number(process.env.PORT_STD || 4124);
const TOKEN = process.env.SUPPORT_TOKEN || 'test-secret-123';
const BASE_SUP = `http://localhost:${PORT_SUP}`;
const BASE_STD = `http://localhost:${PORT_STD}`;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function req(base, path, { headers } = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  let data = null;
  try { data = await res.json(); } catch { /* بدنه غیر JSON */ }
  return { status: res.status, data, headers: res.headers };
}

/** بالا آوردن سرور tsx با ENV داده‌شده — برمی‌گرداند { proc, waitUntilReady } */
function startServer(port, env) {
  const dir = mkdtempSync(join(tmpdir(), 'logs-test-'));
  const proc = spawn(process.execPath, [TSX, SERVER_ENTRY], {
    env: {
      ...process.env,
      DB_PATH: join(dir, 'app.db'),
      BACKUP_DIR: join(dir, 'bk'),
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = [];
  proc.stdout.on('data', (d) => out.push(d));
  proc.stderr.on('data', (d) => out.push(d));
  const waitUntilReady = async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new Error(`سرور روی پورت ${port} زودتر بسته شد:\n${out.join('').slice(-800)}`);
      }
      try {
        const r = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) return;
      } catch { /* هنوز بالا نیامده */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`سرور روی پورت ${port} ظرف ۶۰ ثانیه بالا نیامد.`);
  };
  return { proc, waitUntilReady, cleanupDir: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* بی‌صدا */ } } };
}

const stopServer = (srv) => {
  srv.proc.removeAllListeners('exit');
  srv.proc.kill();
  srv.cleanupDir();
};

const results = { sup: null, std: null };
try {
  // ═══════════ بخش ۱ — سرور پشتیبانی (SUPPORT_ONLY=1) ═══════════
  console.log(`\n🧪 logs-test — سرور پشتیبانی (پورت ${PORT_SUP})\n${'─'.repeat(60)}`);
  const sup = startServer(PORT_SUP, { SUPPORT_ONLY: '1', SUPPORT_TOKEN: TOKEN });
  results.sup = sup;
  await sup.waitUntilReady();

  // — احراز —
  const noHdr = await req(BASE_SUP, '/api/logs');
  ok('بدون هدر → 401', noHdr.status === 401, `status=${noHdr.status}`);
  ok('پیام فارسی ۴۰۱ (هدر الزامی)', noHdr.data?.error?.includes('X-Support-Token'), JSON.stringify(noHdr.data));
  const badHdr = await req(BASE_SUP, '/api/logs', { headers: { 'X-Support-Token': 'wrong-token' } });
  ok('هدر غلط → 401', badHdr.status === 401, `status=${badHdr.status}`);
  ok('پیام فارسی ۴۰۱ (نامعتبر)', badHdr.data?.error?.includes('نامعتبر'), JSON.stringify(badHdr.data));

  // — پاسخ موفق و شکل داده —
  const good = await req(BASE_SUP, '/api/logs', { headers: { 'X-Support-Token': TOKEN } });
  ok('توکن درست → 200', good.status === 200, `status=${good.status}`);
  ok('support_only:true', good.data?.support_only === true, JSON.stringify(good.data).slice(0, 80));
  ok('version رشته', typeof good.data?.version === 'string', String(good.data?.version));
  ok('total عدد = طول entries', typeof good.data?.total === 'number' && good.data.total === good.data?.entries?.length, `total=${good.data?.total}`);
  ok('entries آرایه با t/level/msg', Array.isArray(good.data?.entries) && good.data.entries.every((e) => typeof e.t === 'string' && (e.level === 'info' || e.level === 'error') && typeof e.msg === 'string'));
  ok('زمان ISO معتبر', good.data.entries.length === 0 || !Number.isNaN(Date.parse(good.data.entries[0].t)));
  ok('Cache-Control: no-store', (good.headers.get('cache-control') || '').includes('no-store'), String(good.headers.get('cache-control')));

  // — خطا هم لاگ می‌شود (تحریک ۵۰۰ با JSON خراب) —
  await fetch(`${BASE_SUP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'broken-json',
    signal: AbortSignal.timeout(5000),
  }).catch(() => { /* مهم نیست پاسخ چیست */ });
  const withErr = await req(BASE_SUP, '/api/logs?lines=5', { headers: { 'X-Support-Token': TOKEN } });
  const errEntry = withErr.data?.entries?.find((e) => e.level === 'error');
  ok('خطای ۵۰۰ تحریض‌شده در لاگ (level:error)', !!errEntry, JSON.stringify(withErr.data?.entries?.slice(-2) ?? []));
  ok('msg خطا سقف ۵۰۰ نویسه', !errEntry || errEntry.msg.length <= 500, `len=${errEntry?.msg.length}`);

  // — پارامتر lines —
  const mk = async (n) => (await req(BASE_SUP, `/api/logs${n === undefined ? '' : `?lines=${n}`}`, { headers: { 'X-Support-Token': TOKEN } }));
  // پیش‌فرض ۱۰۰: سرور تازه ۹+ لاگ دارد؛ هر دو ≤۱۰۰ می‌شمارند → فقط شکل را چک می‌کنیم
  const d100 = await mk(100);
  ok('lines=100 → 200', d100.status === 200 && d100.data.entries.length <= 100, `status=${d100.status}`);
  const d50 = await mk(50);
  ok('lines=50 → حداکثر ۵۰ سطر', d50.data.entries.length <= 50, `n=${d50.data.entries.length}`);
  ok('lines=50 = tail واقعی (برابر ۵ خط آخر قبلی)', JSON.stringify(d50.data.entries.slice(-5).map((e) => e.msg)) === JSON.stringify(withErr.data.entries.slice(-5).map((e) => e.msg)));
  const d1 = await mk(1);
  ok('lines=1 → دقیقا ۱ سطر (کف)', d1.data.entries.length === 1, `n=${d1.data.entries.length}`);
  const dLast = await mk(1);
  ok('lines=1 آخرین لاگ را می‌دهد', dLast.data.entries[0]?.msg === errEntry?.msg || dLast.data.entries[0]?.t === withErr.data.entries.at(-1)?.t, JSON.stringify(dLast.data.entries[0] ?? {}));
  const d999 = await mk(999);
  ok('lines=999 → clamp به ۲۰۰ (200 OK)', d999.status === 200 && d999.data.entries.length <= 200, `status=${d999.status} n=${d999.data.entries.length}`);
  const dJunk = await mk('abc');
  ok('lines=abc → پیش‌فرض (200 OK)', dJunk.status === 200 && dJunk.data.entries.length <= 100, `status=${dJunk.status}`);
  // نکته: «0» در parseInt falsy است → پیش‌فرض ۱۰۰ (نه کف ۱)
  const dZero = await mk(0);
  ok('lines=0 → پیش‌فرض ۱۰۰ (200 OK)', dZero.status === 200 && dZero.data.entries.length <= 100, `status=${dZero.status} n=${dZero.data.entries.length}`);
  const dNeg = await mk(-5);
  ok('lines=-5 → clamp به کف ۱', dNeg.status === 200 && dNeg.data.entries.length === 1, `n=${dNeg.data.entries.length}`);

  // — گیت SUPPORT_ONLY: داده‌ی مشتری بسته، /api/logs باز —
  const dev = await req(BASE_SUP, '/api/devices', { headers: { Authorization: 'Bearer x' } });
  ok('گیت پشتیبانی: /api/devices → 403', dev.status === 403, `status=${dev.status}`);
  ok('پیام گیت پشتیبانی', dev.data?.support_only === true, JSON.stringify(dev.data).slice(0, 80));

  stopServer(sup);

  // ═══════════ بخش ۲ — سرور عادی (بدون SUPPORT_ONLY) ═══════════
  console.log(`\n🧪 logs-test — سرور عادی (پورت ${PORT_STD})\n${'─'.repeat(60)}`);
  const std = startServer(PORT_STD, {});
  results.std = std;
  await std.waitUntilReady();
  const stdNo = await req(BASE_STD, '/api/logs');
  ok('بدون SUPPORT_ONLY: بدون هدر → 404', stdNo.status === 404, `status=${stdNo.status}`);
  const stdTok = await req(BASE_STD, '/api/logs', { headers: { 'X-Support-Token': TOKEN } });
  ok('بدون SUPPORT_ONLY: با توکن هم → 404', stdTok.status === 404, `status=${stdTok.status}`);
  const stdVer = await req(BASE_STD, '/api/version');
  ok('support_only:false در /api/version', stdVer.data?.support_only === false, JSON.stringify(stdVer.data));

  stopServer(std);

  // ═══════════ جمع‌بندی ═══════════
  console.log('\n' + '─'.repeat(60));
  console.log(`${fail === 0 ? '✅' : '❌'} نتیجه: ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error(`\n✗ خطای اسکریپت: ${e.message}`);
  process.exit(1);
} finally {
  // اگر وسط کار خطا رخ داد، سرورها خاموش و پوشه‌های موقت پاک شوند (kill روی proc مرده بی‌اثر است)
  try { if (results.sup?.proc?.exitCode === null) stopServer(results.sup); } catch { /* بی‌صدا */ }
  try { if (results.std?.proc?.exitCode === null) stopServer(results.std); } catch { /* بی‌صدا */ }
}
