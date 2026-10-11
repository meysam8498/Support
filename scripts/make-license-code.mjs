#!/usr/bin/env node
// ============================================================
// make-license-code — صدور و ابزار نگهداری کد لایسنس (JWT RS256)
// سامانه‌ی مدیریت تجهیزات — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// مثال‌ها:
//   # یک‌بار: تولید جفت‌کلید (کلید خصوصی نزد شما می‌ماند)
//   node scripts/make-license-code.mjs --gen-keys
//
//   # صدور کد فعال‌سازی یک‌ساله برای «شرکت نمونه»
//   node scripts/make-license-code.mjs --plan year --to "شرکت نمونه" \
//        --email info@company.ir --note "فاکتور ۱۴۰۳-۱۲۳"
//
//   # طرح دائمی + قالب کد گروه‌بندی‌شده برای تایپ آسان (جداکننده: +)
//   node scripts/make-license-code.mjs --plan lifetime --to "شرکت نمونه" --grouped
//
//   # چرخش کلید امضا (کدهای قبلی معتبر می‌مانند):
//   node scripts/make-license-code.mjs --rotate-keys
//
//   # نکات:
//   • --code-days N   اعتبار خودِ کد برای ورود (پیش‌فرض ۱۸۰ روز؛ جدا از اعتبار طرح)
//   • --out file      ذخیره‌ی کد در فایل + نمایش
//   • طرح‌ها: month | quarter | half-year | year | lifetime
//   • کلید خصوصی: keys/license_private.pem (در .gitignore — هرگز کامیت/توزیع نشود)
// ============================================================
import { generateKeyPairSync, createSign, createVerify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);

// keys/ کنار محل اجرا؛ اگر نبود keys/ ریشه‌ی پروژه (کنار خود اسکریپت) — تا اجرا از پوشه‌ی دیگر کلید موجود را گم نکند
const ROOT = dirname(fileURLToPath(import.meta.url)); // <ریشه>/scripts
const keysAt = (name) =>
  existsSync(join(process.cwd(), 'keys', name)) ? join(process.cwd(), 'keys', name) : join(ROOT, '..', 'keys', name);
const PRIV = keysAt('license_private.pem');
const PUB = keysAt('license_public.pem');

// ---------- rotate-keys: چرخش کلید امضا بدون باطل‌کردن کدهای قبلی (۱.۲۹) ----------
// مراحل:
//   ۱) کلیدهای فعلی به license_public_<kid>.pem (عمومی، پذیرفته‌شده) و license_private_<kid>.pem (خصوصی، بایگانی) منتقل می‌شوند
//   ۲) جفت‌کلید جدید ساخته و جایگزین license_private.pem / license_public.pem می‌شود
//   ۳) رجیستری keys/rotations.jsonl ثبت می‌شود
//   ۴) راهنمای به‌روزرسانی مشتری‌ها چاپ می‌شود (کلید عمومی به‌همراه kid)
if (has('--rotate-keys')) {
  if (!existsSync(PRIV) || !existsSync(PUB)) {
    console.error('برای چرخش، اول کلید فعلی باید موجود باشد (--gen-keys).');
    process.exit(1);
  }
  const oldPub = readFileSync(PUB, 'utf8');
  const oldKid = createHash('sha256').update(oldPub.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);
  // ۱) بایگانی کلیدهای قدیمی با kid در نام — پذیرفته‌شده‌ی سرور (public) و بایگانی (private)
  const archivedPub = join(dirname(PUB), 'accepted_license_public_keys', `license_public_${oldKid}.pem`);
  const archivedPriv = join(dirname(PRIV), `license_private_${oldKid}.pem`);
  mkdirSync(dirname(archivedPub), { recursive: true });
  renameSync(PUB, archivedPub);
  // کپی خصوصی بایگانی (اصل PRIV جایگزین می‌شود — کپی نگه می‌داریم)
  writeFileSync(archivedPriv, readFileSync(PRIV, 'utf8'));
  // ۲) جفت‌کلید جدید
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const newKid = createHash('sha256').update(publicKey.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);
  writeFileSync(PRIV, privateKey);
  writeFileSync(PUB, publicKey);
  // ۳) رجیستری چرخش
  const rotFile = join(dirname(PRIV), 'rotations.jsonl');
  appendFileSync(rotFile, JSON.stringify({ rotated_at: new Date().toISOString(), old_kid: oldKid, new_kid: newKid, archived_pub: archivedPub }) + '\n', 'utf8');
  console.log('✓ چرخش کلید انجام شد:');
  console.log(`  کلید قدیمی (kid=${oldKid}) → بایگانی: ${archivedPub}`);
  console.log(`  کلید جدید  (kid=${newKid}) → ${PUB}`);
  console.log('  رجیستری چرخش: ' + rotFile);
  console.log('\n→ برای سرور مشتری/تیاری (یکی از سه):');
  console.log('  (الف) فایل بایگانی عمومی قدیمی را کنار کلید جدید در keys/ سرور بگذارید (نامش license_public_' + oldKid + '.pem ماننَد).');
  console.log('  (ب) یا مقدار LICENSE_PUBLIC_KEYS سرور را با فرمت ' + oldKid + ':<PEM قدیمی> بروزرسانی کنید.');
  console.log('  (ج) یا فایل server/src/lib/license_public_key.pem را با کلید جدید جایگزین و سرور را دوباره بسازید.');
  console.log('\nⓘ کدهای صدورشده‌ی قبلی تا پایان exp خود با کلید قدیمی معتبر می‌مانند (تأیید چندکلیدی سرور).');
  process.exit(0);
}

// ---------- gen-keys ----------
if (has('--gen-keys')) {
  if (existsSync(PRIV) && !has('--force')) {
    console.error('کلید خصوصی از قبل هست — برای تولید دوباره --force بزنید (کدهای قبلی باطل می‌شوند!).');
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  mkdirSync(dirname(PRIV), { recursive: true });
  writeFileSync(PRIV, privateKey);
  writeFileSync(PUB, publicKey);
  console.log('✓ کلیدها ساخته شدند:');
  console.log('  خصوصی (نزد شما): ' + PRIV);
  console.log('  عمومی (برای server/src/lib/license_public_key.pem یا LICENSE_PUBLIC_KEY): ' + PUB);
  console.log('  کلید عمومی جدید را در فایل server/src/lib/license_public_key.pem جایگزین کنید.');
  process.exit(0);
}

// ---------- verify (برای چک سریع یک کد بدون سرور — کد گروه‌بندی‌شده هم می‌فهمد) ----------
if (has('--verify')) {
  const codeRaw = opt('--verify') || '';
  // پذیرش کد گروه‌بندی‌شده: جداکننده‌ی + بیرون از الفبای base64url است و حذفش بی‌خطر
  const code = codeRaw.includes('+')
    ? codeRaw.trim().split('.').map((seg) => seg.replace(/\+/g, '')).join('.')
    : codeRaw.trim();
  const pub = existsSync(PUB) ? readFileSync(PUB, 'utf8') : '';
  const [h, p, s] = code.split('.');
  const data = `${h}.${p}`;
  const ok = createVerify('RSA-SHA256').update(data).end().verify(pub, Buffer.from(s, 'base64url'));
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  console.log(JSON.stringify({ signature_ok: ok, payload }, null, 2));
  process.exit(ok ? 0 : 1);
}

// ---------- ledger: رجیستری محلی کدهای صادرشده (کنار کلید) ----------
const LEDGER = join(dirname(PRIV), 'license_ledger.jsonl');
function ledgerLoad() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function ledgerSave(entry) {
  appendFileSync(LEDGER, JSON.stringify(entry) + '\n', 'utf8');
}
if (has('--ledger')) {
  const rows = ledgerLoad();
  const q = (opt('--ledger') || '').trim();
  const filtered = q
    ? rows.filter((r) =>
        r.jti?.toLowerCase().includes(q.toLowerCase())
        || r.note?.includes(q)
        || r.to?.includes(q)
        || r.email?.toLowerCase().includes(q.toLowerCase()))
    : rows;
  if (filtered.length === 0) {
    console.log(q ? `چیزی برای «${q}» در رجیستری نیست (${rows.length} رکورد کل).` : `رجیستری خالی است.`);
  } else {
    console.log(`رجیستری کدهای صادرشده (${filtered.length} از ${rows.length}):
${'─'.repeat(72)}`);
    for (const r of filtered.slice().reverse()) {
      console.log(`  ${r.issued_at}  ${r.plan.padEnd(10)} ${r.jti.padEnd(20)} ${r.to ?? '—'}${r.note ? ` · ${r.note}` : ''}`);
    }
  }
  process.exit(0);
}

// ---------- revoke: ثبت ابطال در رجیستری محلی (فروشنده) ----------
if (has('--revoke')) {
  const jti = (opt('--revoke') || '').trim();
  if (!jti) { console.error('شناسه‌ی کد را بدهید: --revoke XXXX-XXXX-… یا --revoke-code <کد کامل>'); process.exit(1); }
  const rows = ledgerLoad();
  const rec = rows.find((r) => r.jti === jti);
  if (!rec) {
    console.error(`«${jti}» در رجیستری محلی نیست — اول با --ledger جست‌وجو کنید.`);
    process.exit(1);
  }
  rec.revoked = true;
  rec.revoked_at = new Date().toISOString();
  writeFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  console.log(`✓ «${jti}» در رجیستری محلی باطل علامت خورد.
یادآوری: برای بستن فعال‌سازی روی سرورِ مشتری، آن‌جا هم ابطال کنید:
  ادمین مشتری ← صفحه‌ی «🔑 ورود کد لایسنس» ← بخش ابطال ← jti`);
  process.exit(0);
}
if (has('--revoke-code')) {
  const codeRaw = opt('--revoke-code') || '';
  const code = codeRaw.includes('+')
    ? codeRaw.trim().split('.').map((seg) => seg.replace(/\+/g, '')).join('.')
    : codeRaw.trim();
  try {
    const payload = JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString('utf8'));
    const argvSave = process.argv;
    process.argv = [argvSave[0], argvSave[1], '--revoke', payload.jti];
    // فراخوانی همان مسیر بالا
    const rows = ledgerLoad();
    const rec = rows.find((r) => r.jti === payload.jti);
    if (!rec) { console.error(`jti «${payload.jti}» این کد در رجیستری محلی نیست.`); process.exit(1); }
    rec.revoked = true;
    rec.revoked_at = new Date().toISOString();
    writeFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    console.log(`✓ «${payload.jti}» در رجیستری محلی باطل علامت خورد.`);
  } catch (e) {
    console.error('کد قابل خواندن نبود:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

// ---------- issue ----------
const plan = opt('--plan') || 'year';
const validPlans = ['month', 'quarter', 'half-year', 'year', 'lifetime'];
if (!validPlans.includes(plan)) {
  console.error(`طرح نامعتبر: ${plan} — یکی از: ${validPlans.join(' | ')}`);
  process.exit(1);
}
if (!existsSync(PRIV)) {
  console.error('کلید خصوصی نیست — اول اجرا کنید: node scripts/make-license-code.mjs --gen-keys');
  process.exit(1);
}
const priv = readFileSync(PRIV, 'utf8');

const to = opt('--to') || null;
const email = opt('--email') || null;
const note = opt('--note') || null;
const codeDays = Number(opt('--code-days') || 180);
const grouped = has('--grouped');
const out = opt('--out');

const jti = (has('--jti') ? opt('--jti') : undefined) ||
  [...Array(4)].map(() => Math.random().toString(36).slice(2, 6)).join('-').toUpperCase();

const now = Math.floor(Date.now() / 1000);
const exp = now + codeDays * 86400;
// kid در هدر — fingerprint کلید امضاکننده (سرور با آن مستقیم کلید درست را امتحان می‌کند)
const kid = createHash('sha256').update(readFileSync(PUB, 'utf8').replace(/\r/g, '').trim()).digest('hex').slice(0, 8);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ jti, plan, to, email, note, iat: now, exp }))
  .toString('base64url');
const signer = createSign('RSA-SHA256');
signer.update(`${header}.${payload}`);
const sig = signer.sign(priv, 'base64url');
let token = `${header}.${payload}.${sig}`;

if (grouped) {
  // جداکننده باید بیرون از الفبای base64url (A-Za-z0-9_-) باشد تا حذف آن در سرور
  // بی‌خطر باشد — «-» جزو الفباست و باعث خرابی امضا می‌شود؛ به همین دلیل «+»
  const parts = token.split('.');
  token = parts.map((p) => p.match(/.{1,24}/g).join('+')).join('.');
}

if (out) {
  writeFileSync(out, token + '\n', 'utf8');
  console.log('✓ کد در فایل ذخیره شد: ' + out);
}
// ثبت خودکار در رجیستری محلی فروشنده (keys/license_ledger.jsonl)
try {
  ledgerSave({ jti, plan, to, email, note, code_days: codeDays, issued_at: new Date().toISOString() });
} catch (e) {
  console.error('⚠ ثبت رجیستری ناموفق:', e.message);
}
console.log('\nکد لایسنس (' + plan + '):');
console.log('─'.repeat(60));
console.log(token);
console.log('─'.repeat(60));
console.log('jti: ' + jti + ' · اعتبار ورود کد: ' + codeDays + ' روز' + (to ? ' · دارنده: ' + to : ''));
