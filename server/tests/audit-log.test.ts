// ============================================================
// لاگ ممیزی — ثبت درخواست‌های نوشتنی، عدم درج مقدار حساس، دسترسی فقط ادمین
// ============================================================
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

let s: TempServer;
let adminToken: string;

type AuditRow = { method: string; path: string; status: number; username: string; summary: string };

beforeAll(async () => {
  s = await startTempServer();
  adminToken = await s.login();
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('لاگ ممیزی', () => {
  it('درخواست نوشتنیِ ادمین در audit_log ثبت می‌شود', async () => {
    const created = await s.api<{ id: number }>('POST', '/api/users', {
      token: adminToken,
      body: { username: 'audit_target', password: 'Audit-Pass-1234', full_name: 'کاربر ممیزی', role: 'viewer' },
    });
    expect(created.status).toBe(201);

    const r = await s.api<{ items: AuditRow[] }>('GET', '/api/audit?limit=50', { token: adminToken });
    expect(r.status).toBe(200);
    const row = r.data.items.find((i) => i.method === 'POST' && i.path === '/api/users');
    expect(row).toBeTruthy();
    expect(row!.username).toBe('admin');
    expect(row!.status).toBe(201);
  });

  it('رمز در خلاصه‌ی بدنه درج نمی‌شود (redaction)', async () => {
    const r = await s.api<{ items: AuditRow[] }>('GET', '/api/audit?limit=50', { token: adminToken });
    const row = r.data.items.find((i) => i.path === '/api/users' && i.method === 'POST')!;
    expect(row.summary).not.toContain('Audit-Pass-1234');
    expect(row.summary).toContain('***');
  });

  it('درخواست‌های خواندنی (GET) ثبت نمی‌شوند', async () => {
    await s.api('GET', '/api/devices', { token: adminToken });
    const r = await s.api<{ items: AuditRow[] }>('GET', '/api/audit?limit=50', { token: adminToken });
    expect(r.data.items.some((i) => i.method === 'GET')).toBe(false);
  });

  it('غیرادمین به /api/audit دسترسی ندارد', async () => {
    const created = await s.api<{ id: number }>('POST', '/api/users', {
      token: adminToken,
      body: { username: 'audit_viewer', password: 'Viewer-Pass-1234', full_name: 'بیننده', role: 'viewer' },
    });
    expect(created.status).toBe(201);
    const viewer = await s.api<{ token: string }>('POST', '/api/auth/login', {
      body: { username: 'audit_viewer', password: 'Viewer-Pass-1234' },
    });
    const r = await s.api('GET', '/api/audit', { token: viewer.data.token });
    expect(r.status).toBe(403);
  });
});
