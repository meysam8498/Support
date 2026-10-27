// ============================================================
// هلپر تست: سرور موقت ایزوله — DB_PATH در tmpdir، JWT_SECRET آزمایشی،
// بدون زمان‌بند بکاپ مزاحم. در afterEach/afterAll خاموش می‌شود.
// کلیدها هم ایزوله‌اند: هر سرور جفت‌کلید مخصوص خودش را در tmpdir می‌سازد و
// LICENSE_KEYS_DIR/LICENSE_ISSUE_KEY به همان اشاره می‌کنند — keys/ واقعی پروژه
// هرگز خوانده/چرخش/بازنویسی نمی‌شود (بازنویسی با env فراخواننده ممکن است).
// ============================================================
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface TempServer {
  base: string;
  port: number;
  dir: string;
  proc: ChildProcess;
  /** login پیش‌فرض admin → توکن */
  login(user?: string, pass?: string): Promise<string>;
  /** فراخوانی API با توکن اختیاری */
  api<T = unknown>(method: string, path: string, opts?: { token?: string; body?: unknown }): Promise<{ status: number; data: T }>;
  close(): Promise<void>;
}

// پورت پایه برای تست — با هر شروع ۱۰ پورت جلو می‌رود تا تداخل TimeWait/دستاگپ‌دار پس از فایل قبلی حذف شود
// پورت آزاد از خودِ سیستم‌عامل (port 0): فایل‌های موازی vitest دیگر هرگز پورت مشترک نمی‌گیرند.
// قبلاً پورت حدس زده می‌شد و اگر سرورِ فایلِ دیگری همان پورت را گرفته بود، health-check
// همان سرورِ بیگانه پاسخ می‌داد و تست‌ها با کلید/دیتابیس اشتباه اجرا می‌شدند (رگرسیون ۱.۳۰).
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as import('node:net').AddressInfo;
      const p = addr.port;
      srv.close(() => resolve(p));
    });
  });
}

export async function startTempServer(env: Record<string, string> = {}): Promise<TempServer> {
  // تداخل EADDRINUSE (نادر با پورت OS-ای): تا ۵ بار با پورت تازه تلاش می‌کنیم
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await spawnAt(await freePort(), env); } catch (e) {
      const msg = String((e as Error).message);
      if (!msg.includes('EADDRINUSE')) throw e;
      if (attempt === 4) throw e;
    }
  }
  throw new Error('unreachable');
}

async function spawnAt(port: number, env: Record<string, string> = {}): Promise<TempServer> {
  const dir = mkdtempSync(join(tmpdir(), 'sem-test-'));
  // ───── کلیدهای آزمایشی ایزوله (۱.۳۰) ─────
  // هر سرور موقت «جفت‌کلید مخصوص خودش» را درون همان tmpdir می‌سازد و
  // LICENSE_KEYS_DIR / LICENSE_ISSUE_KEY به آن اشاره می‌کنند:
  //   • هیچ تستی کلیدهای واقعی keys/ پروژه را نمی‌خواند و مهم‌تر: نمی‌چرخاند/بازنویسی نمی‌کند
  //     (حتی اگر فراخواننده LICENSE_KEYS_DIR ندهد — پیش‌فرض هم ایزوله است)
  //   • اولویت با env فراخواننده است: تست‌هایی که خودشان کلید/پوشه می‌سازند همچنان برنده‌اند
  const testKeysDir = join(dir, 'keys');
  mkdirSync(testKeysDir, { recursive: true });
  const testPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(join(testKeysDir, 'license_public.pem'), String(testPair.publicKey));
  writeFileSync(join(testKeysDir, 'license_private.pem'), String(testPair.privateKey));
  const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const ENTRY = join(ROOT, 'server', 'src', 'index.ts');
  const proc = spawn(process.execPath, [TSX, ENTRY], {
    cwd: ROOT, // در ریشه — keys/ و مسیرهای نسبی مثل اجرای واقعی
    env: {
      ...process.env,
      // کلیدهای ایزوله‌ی این سرور موقت (قبل از ...env تا فراخواننده بتواند بازنویسی کند)
      LICENSE_KEYS_DIR: testKeysDir,
      LICENSE_ISSUE_KEY: join(testKeysDir, 'license_private.pem'),
      ...env, // ENV تزریق‌شده (کلیدهای لایسنس آزمایشی و...) اولویت دارد
      PORT: String(port),
      DB_PATH: join(dir, 'app.db'),
      BACKUP_DIR: join(dir, 'bk'),
      JWT_SECRET: 'test-secret-not-for-production-32chars-ok!',
      // زمان‌بند بکاپ در تست مزاحم نیست — بازه‌ی بلند
      BACKUP_AT: '23:59',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out: string[] = [];
  proc.stdout.on('data', (d) => out.push(String(d)));
  proc.stderr.on('data', (d) => out.push(String(d)));
  proc.on('exit', (_c, sig) => {
    // در صورت کرش غیرمنتظره، لاگ داخل خطای بعدی ریخته می‌شود (نگهداری در map بیرونی)
    if (sig !== 'SIGTERM') (proc as ChildProcess & { _snippet?: string })._snippet = out.join('').slice(-600);
  });
  // healthcare
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`سرور موقت زود بسته شد: ${out.join('').slice(-600)}`);
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) { up = true; break; }
    } catch { /* دیوار */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) throw new Error(`سرور موقت بالا نیامد: ${out.join('').slice(-600)}`);

  async function api<T>(method: string, path: string, opts: { token?: string; body?: unknown; raw?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data: data as T };
  }

  async function login(user = 'admin', pass = 'admin123') {
    const r = await api<{ token?: string; error?: string }>('POST', '/api/auth/login', { body: { username: user, password: pass } });
    if (r.status !== 200 || !r.data.token) throw new Error(`login شکست خورد (${r.status}): ${JSON.stringify(r.data)}`);
    return r.data.token;
  }

  return {
    base, port, dir, proc, login, api,
    async close() {
      try { proc.kill('SIGTERM'); } catch { /* بی‌صدا */ }
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* بی‌صدا */ }
    },
  };
}
