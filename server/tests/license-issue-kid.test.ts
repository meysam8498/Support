// ============================================================
// تست kid در هدر کد لایسنس وقتی کلید خصوصی «محتوا» است (مثل نصب‌کننده)
// سناریو: نصب‌کننده‌ی فروشنده کلید خصوصی را از %LOCALAPPDATA% می‌خواند و به‌صورت
// محتوا در LICENSE_ISSUE_KEY می‌دهد؛ کلید عمومیِ متناظر روی دیسک نیست. قبلاً
// loadIssuePublicPem فقط فایل‌ها را می‌گشت و یا kid غایب بود یا (اگر keys/ پروژه
// پیدا می‌شد) kidِ کلید بی‌ربط در هدر می‌نشست. حالا عمومی از خود کلید مشتق می‌شود.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

const kidOf = (pem: string) => createHash('sha256').update(pem.replace(/\r/g, '').trim()).digest('hex').slice(0, 8);

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const PUB = String(pair.publicKey);
const PRIV = String(pair.privateKey);
const KID = kidOf(PUB);

let s: TempServer;
let token: string;

beforeAll(async () => {
  // پوشه‌ی کلید خالی = هیچ license_public.pem روی دیسک نیست (شبیه نصب‌کننده)
  const emptyKeys = join(mkdtempSync(join(tmpdir(), 'sem-installed-')), 'keys');
  mkdirSync(emptyKeys, { recursive: true });
  s = await startTempServer({
    LICENSE_ISSUE_KEY: PRIV, // محتوا، نه مسیر
    LICENSE_KEYS_DIR: emptyKeys,
    LICENSE_PUBLIC_KEY: PUB, // اعتبارسنجی کدهای صادرشده با همین کلید
  });
  token = await s.login();
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('صدور لایسنس با کلید محتوایی (نصب‌کننده)', () => {
  it('کد صادر می‌شود و هدر JWT همان kid کلید امضاکننده را دارد', async () => {
    const r = await s.api<{ code?: string; plan?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'month', to: 'نصب واقعی فروشنده', code_days: 30 },
    });
    expect(r.status).toBe(201);
    const code = r.data.code || '';
    const header = JSON.parse(Buffer.from(code.split('.')[0], 'base64url').toString('utf8'));
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(KID);
  });

  it('کد صادرشده با همین کلید قابل تأیید است', async () => {
    const r = await s.api<{ code?: string }>('POST', '/api/license/issue', {
      token,
      body: { plan: 'year', to: 'تست تأیید' },
    });
    const code = r.data.code || '';
    const c = await s.api<{ valid?: boolean; error?: string }>('POST', '/api/license/code-status', {
      token,
      body: { code },
    });
    expect(c.data.valid).toBe(true);
    expect(c.data.error).toBeUndefined();
  });
});
