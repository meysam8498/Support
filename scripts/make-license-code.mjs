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
//   # طرح دائمی + قالب کد گروه‌بندی‌شده برای تایپ آسان
//   node scripts/make-license-code.mjs --plan lifetime --to "شرکت نمونه" --grouped
//
//   # نکات:
//   • --code-days N   اعتبار خودِ کد برای ورود (پیش‌فرض ۱۸۰ روز؛ جدا از اعتبار طرح)
//   • --out file      ذخیره‌ی کد در فایل + نمایش
//   • طرح‌ها: month | quarter | half-year | year | lifetime
//   • کلید خصوصی: keys/license_private.pem (در .gitignore — هرگز کامیت/توزیع نشود)
// ============================================================
import { generateKeyPairSync, createSign, createVerify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);

const PRIV = join(process.cwd(), 'keys', 'license_private.pem');
const PUB = join(process.cwd(), 'keys', 'license_public.pem');

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
  writeFileSync(PRIV, privateKey);
  writeFileSync(PUB, publicKey);
  console.log('✓ کلیدها ساخته شدند:');
  console.log('  خصوصی (نزد شما): ' + PRIV);
  console.log('  عمومی (برای server/src/lib/license_public_key.pem یا LICENSE_PUBLIC_KEY): ' + PUB);
  console.log('  کلید عمومی جدید را در فایل server/src/lib/license_public_key.pem جایگزین کنید.');
  process.exit(0);
}

// ---------- verify (برای چک سریع یک کد بدون سرور) ----------
if (has('--verify')) {
  const code = opt('--verify');
  const pub = existsSync(PUB) ? readFileSync(PUB, 'utf8') : '';
  const [h, p, s] = code.split('.');
  const data = `${h}.${p}`;
  const ok = createVerify('RSA-SHA256').update(data).end().verify(pub, Buffer.from(s, 'base64url'));
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  console.log(JSON.stringify({ signature_ok: ok, payload }, null, 2));
  process.exit(ok ? 0 : 1);
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
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ jti, plan, to, email, note, iat: now, exp }))
  .toString('base64url');
const signer = createSign('RSA-SHA256');
signer.update(`${header}.${payload}`);
const sig = signer.sign(priv, 'base64url');
let token = `${header}.${payload}.${sig}`;

if (grouped) {
  const parts = token.split('.');
  token = parts.map((p) => p.match(/.{1,24}/g).join('-')).join('.');
}

if (out) {
  writeFileSync(out, token + '\n', 'utf8');
  console.log('✓ کد در فایل ذخیره شد: ' + out);
}
console.log('\nکد لایسنس (' + plan + '):');
console.log('─'.repeat(60));
console.log(token);
console.log('─'.repeat(60));
console.log('jti: ' + jti + ' · اعتبار ورود کد: ' + codeDays + ' روز' + (to ? ' · دارنده: ' + to : ''));
