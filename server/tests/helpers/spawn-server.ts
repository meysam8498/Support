// ============================================================
// هلپر تست: سرور موقت ایزوله — DB_PATH در tmpdir، JWT_SECRET آزمایشی،
// بدون زمان‌بند بکاپ مزاحم. در afterEach/afterAll خاموش می‌شود.
// ============================================================
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
let nextPort = (Number(process.env.TEST_PORT_BASE) || 4311) + Math.floor(Math.random() * 20) * 10;

export async function startTempServer(env: Record<string, string> = {}): Promise<TempServer> {
  const port = nextPort++;
  const dir = mkdtempSync(join(tmpdir(), 'sem-test-'));
  const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const ENTRY = join(ROOT, 'server', 'src', 'index.ts');
  const proc = spawn(process.execPath, [TSX, ENTRY], {
    cwd: ROOT, // در ریشه — keys/ و مسیرهای نسبی مثل اجرای واقعی
    env: {
      ...process.env,
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
