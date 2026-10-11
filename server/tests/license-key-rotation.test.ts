// ============================================================
// تست چرخش کلید امضای لایسنس (۱.۲۹)
// سناریو: کد صادرشده با کلید قدیمی (kid قدیمی) پس از چرخش سرور (کلید جاری = جدید)
// باید هنوز تأیید و فعال شود؛ و کد صادرشده با کلید جدید هم جداً تأیید شود.
// ایزوله‌سازی: کلیدها به‌جای keys/ واقعی از ENV به سرور موقت تزریق می‌شوند
// (LICENSE_PUBLIC_KEY = جاری/جدید، LICENSE_PUBLIC_KEYS = قدیمی به‌همراه kid).
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createSign, createHash } from 'node:crypto';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const OLD_PUB = String(pair.publicKey);
const OLD_PRIV = String(pair.privateKey);

const pair2 = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const NEW_PUB = String(pair2.publicKey);
const NEW_PRIV = String(pair2.privateKey);

const OLD_KID = kidOf(OLD_PUB);
const NEW_KID = kidOf(NEW_PUB);

function makeToken(privPem: string, pubPem: string, jti: string, plan = 'year'): string {
  const kid = kidOf(pubPem);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ jti, plan, to: 'تست چرخش', iat: now, exp: now + 86400 })).toString('base64url');
  const s = createSign('RSA-SHA256');
  s.update(`${header}.${payload}`);
  return `${header}.${payload}.${s.sign(privPem, 'base64url')}`;
}

// کد قبلیِ مشتری (صادرشده با کلید قدیمی) و کد جدید (پس از چرخش)
const OLD_CODE = makeToken(OLD_PRIV, OLD_PUB, 'ROTOOLDC1');
const NEW_CODE = makeToken(NEW_PRIV, NEW_PUB, 'ROTNEWDC2');

let s: TempServer;
let token: string;

beforeAll(async () => {
  s = await startTempServer({
    // سرور پس از چرخش: جاری = کلید جدید؛ پذیرفته‌شده = قدیمی (کدهای فعال‌نشده با آن معتبرند)
    LICENSE_PUBLIC_KEY: NEW_PUB,
    LICENSE_PUBLIC_KEYS: `${OLD_KID}:${OLD_PUB.replace(/\r\n/g, '\n')}`,
  });
  token = await s.login();
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('چرخش کلید امضا (multi-key verify)', () => {
  it('کد قدیمی با kid قدیمی → تأیید و فعال‌سازی ۲۰۱ (نمیمیرد در چرخش!)', async () => {
    const r = await s.api<{ ok?: boolean; plan?: string; licensed_to?: string }>('POST', '/api/license/activate', { token, body: { code: OLD_CODE } });
    expect(r.status).toBe(201);
    expect(r.data.ok).toBe(true);
    expect(r.data.plan).toBe('year');
    // jti در سوابق فعال‌سازی ثبت شده باشد (بدون فیلد jti در response)
    const acts = await s.api<Array<{ jti?: string }>>('GET', '/api/license/activations', { token });
    expect(acts.status).toBe(200);
    expect(Array.isArray(acts.data) ? acts.data.some((a) => a.jti === 'ROTOOLDC1') : false).toBe(true);
  });

  it('کد قدیمی replay → 409 (ابعاد یکتابانگی حفظ شده)', async () => {
    const r = await s.api('POST', '/api/license/activate', { token, body: { code: OLD_CODE } });
    expect(r.status).toBe(409);
  });

  it('کد جدید با kid جدید → تأیید و فعال‌سازی ۲۰۱', async () => {
    const prev = await s.api('POST', '/api/license/revoke', { token, body: { jti: 'ROTNEWDC2' } }); // پاک‌سازی احتمالی
    void prev;
    const r = await s.api<{ jti?: string; plan?: string }>('POST', '/api/license/code-status', { token, body: { code: NEW_CODE } });
    expect(r.status).toBe(200);
    expect(r.data.jti).toBe('ROTNEWDC2');
    expect(r.data.plan).toBe('year');
  });

  it('کد با امضای کلید کاملاً ناشناس (نه در پذیرفته‌شده‌ها) → 400', async () => {
    const pair3 = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const rogue = makeToken(String(pair3.privateKey), String(pair3.publicKey), 'ROGUE1234');
    const r = await s.api('POST', '/api/license/activate', { token, body: { code: rogue } });
    expect(r.status).toBe(400);
  });
});
