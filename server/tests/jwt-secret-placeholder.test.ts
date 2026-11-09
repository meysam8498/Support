// ============================================================
// گارد JWT_SECRET نمونه (۱.۳۴.۰): اگر کسی همان مقدار مستندات/.env.example را
// بگذارد، توکن‌ها برای همه‌ی خوانندگان مخزن قابل جعل می‌شوند.
//   • LICENSE_ENFORCE=1 (نصب تجاری) → سرور باید بالا نیاید و پیام روشن بدهد
//   • بدون enforce → بالا می‌آید ولی هشدار صریح در لاگ می‌نویسد
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACEHOLDER = 'please-change-this-secret-in-production-9f2a4c7e1b8d';

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

function spawnServer(env: Record<string, string>): { proc: ChildProcess; out: () => string; port: number; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sem-jwt-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'keys'), { recursive: true });
  const port = 0; // پورت واقعی از stdout خوانده می‌شود
  const proc = spawn(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'server', 'src', 'index.ts')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      DB_PATH: join(dir, 'app.db'),
      DATA_DIR: dir,
      BACKUP_DIR: join(dir, 'bk'),
      BACKUP_AT: '23:59',
      LICENSE_KEYS_DIR: join(dir, 'keys'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(proc);
  let buf = '';
  proc.stdout?.on('data', (d) => { buf += String(d); });
  proc.stderr?.on('data', (d) => { buf += String(d); });
  return { proc, out: () => buf, port, dir };
}

describe('JWT_SECRET نمونه', () => {
  it('با LICENSE_ENFORCE=1 سرور بالا نمی‌آید و علت را می‌گوید', async () => {
    const port = await freePort();
    const s = spawnServer({ JWT_SECRET: PLACEHOLDER, LICENSE_ENFORCE: '1', PORT: String(port) });
    const code = await new Promise<number | null>((resolve) => {
      const t = setTimeout(() => resolve(null), 45_000);
      s.proc.once('exit', (c) => { clearTimeout(t); resolve(c); });
    });
    expect(code).not.toBeNull(); // بسته شد، نه این‌که معلق بماند
    expect(code).not.toBe(0);
    expect(s.out()).toMatch(/JWT_SECRET/);
    expect(s.out()).toMatch(/LICENSE_ENFORCE/);
  }, 60_000);

  it('بدون enforce بالا می‌آید ولی هشدار صریح می‌دهد', async () => {
    const port = await freePort();
    const s = spawnServer({ JWT_SECRET: PLACEHOLDER, PORT: String(port) });
    const deadline = Date.now() + 45_000;
    let up = false;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) { up = true; break; }
      } catch { /* هنوز بالا نیامده */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(up, `سرور بالا نیامد: ${s.out().slice(-400)}`).toBe(true);
    expect(s.out()).toMatch(/JWT_SECRET/);
    expect(s.out()).toMatch(/جعل|شناخته‌شده/);
  }, 60_000);
});
