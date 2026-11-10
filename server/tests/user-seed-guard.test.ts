// ============================================================
// گارد رمزهای پیش‌فرض کاربران (۱.۳۴.۰)
//   • استقرار واقعی (NODE_ENV=production) بدون ADMIN_PASSWORD یا با admin123 → بالا نمی‌آید
//   • نقش‌های دیگر بدون رمز قوی → ساخته نمی‌شوند (ورودشان 401)
//   • اپ دسکتاپ (DESKTOP_SHELL=1) رفتار قبلی را نگه می‌دارد (ورود اولیه‌ی مشتری)
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STRONG = 'Zq8_vN3rT!9cKp2Lw';

const procs: ChildProcess[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const p of procs.splice(0)) { try { p.kill(); } catch { /* */ } }
  for (const d of dirs.splice(0)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as import('node:net').AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });
}

function spawnServer(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'sem-seed-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'keys'), { recursive: true });
  const proc = spawn(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'server', 'src', 'index.ts')], {
    cwd: ROOT,
    env: {
      ...process.env,
      DB_PATH: join(dir, 'app.db'),
      DATA_DIR: dir,
      BACKUP_DIR: join(dir, 'bk'),
      BACKUP_AT: '23:59',
      LICENSE_KEYS_DIR: join(dir, 'keys'),
      JWT_SECRET: 'seed-guard-test-secret-32chars-ok!!',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(proc);
  let buf = '';
  proc.stdout?.on('data', (d) => { buf += String(d); });
  proc.stderr?.on('data', (d) => { buf += String(d); });
  return { proc, out: () => buf };
}

async function waitExit(proc: ChildProcess, ms = 45_000): Promise<number | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    proc.once('exit', (c) => { clearTimeout(t); resolve(c); });
  });
}

async function waitUp(port: number, out: () => string, ms = 60_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch { /* هنوز بالا نیامده */ }
    if (/نمی‌آید|Error/.test(out())) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function login(port: number, username: string, password: string): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.status;
}

describe('گارد رمز پیش‌فرض کاربران', () => {
  it('production بدون ADMIN_PASSWORD → سرور بالا نمی‌آید', async () => {
    const port = await freePort();
    const s = spawnServer({ NODE_ENV: 'production', PORT: String(port) });
    const code = await waitExit(s.proc);
    expect(code).not.toBeNull();
    expect(code).not.toBe(0);
    expect(s.out()).toMatch(/ADMIN_PASSWORD/);
  }, 60_000);

  it('production با ADMIN_PASSWORD=admin123 → بالا نمی‌آید', async () => {
    const port = await freePort();
    const s = spawnServer({ NODE_ENV: 'production', PORT: String(port), ADMIN_PASSWORD: 'admin123' });
    const code = await waitExit(s.proc);
    expect(code).not.toBeNull();
    expect(code).not.toBe(0);
    expect(s.out()).toMatch(/ADMIN_PASSWORD/);
  }, 60_000);

  it('production با رمز قوی: ادمین ساخته می‌شود و کاربران پیش‌فرض نه', async () => {
    const port = await freePort();
    const s = spawnServer({ NODE_ENV: 'production', PORT: String(port), ADMIN_PASSWORD: STRONG });
    expect(await waitUp(port, s.out), `بالا نیامد: ${s.out().slice(-300)}`).toBe(true);
    expect(await login(port, 'admin', STRONG)).toBe(200);
    expect(await login(port, 'admin', 'admin123')).toBe(401);
    expect(await login(port, 'user', 'user123')).toBe(401);
    expect(await login(port, 'warehouse', 'warehouse123')).toBe(401);
  }, 90_000);

  it('اپ دسکتاپ (DESKTOP_SHELL=1) ورود اولیه با admin123 را نگه می‌دارد', async () => {
    const port = await freePort();
    const s = spawnServer({ NODE_ENV: 'production', DESKTOP_SHELL: '1', PORT: String(port) });
    expect(await waitUp(port, s.out), `بالا نیامد: ${s.out().slice(-300)}`).toBe(true);
    expect(await login(port, 'admin', 'admin123')).toBe(200);
  }, 90_000);
});
