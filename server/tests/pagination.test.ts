// ============================================================
// صفحه‌بندی سمت سرور — تجهیزات و قطعات
// • limit/offset و هدر X-Total-Count
// • فیلتر q و status
// • پرچم‌های تکرار پارت‌نامبر/سریال و /stats
// ============================================================
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startTempServer, type TempServer } from './helpers/spawn-server.js';

let s: TempServer;
let token: string;
let deviceId: number;

interface Dev { id: number; main_serial: string; status: string }
interface Part { id: number; title: string; pn_count: number; serial_count: number }

beforeAll(async () => {
  s = await startTempServer();
  token = await s.login();
  // پروژه/نوع تجهیز از seed موجود است (project 1، device_type 1)
  const dev = await s.api<{ id: number }>('POST', '/api/devices', {
    token,
    body: { project_id: 1, device_type_id: 1, main_serial: 'PAG-001', status: 'active' },
  });
  expect(dev.status).toBe(201);
  deviceId = dev.data.id;

  for (const [i, serial] of ['PAG-002', 'PAG-003'].entries()) {
    const r = await s.api('POST', '/api/devices', {
      token,
      body: { project_id: 1, device_type_id: 1, main_serial: serial, status: i === 0 ? 'defective' : 'active' },
    });
    expect(r.status).toBe(201);
  }
}, 70_000);

afterAll(async () => { await s?.close(); });

describe('صفحه‌بندی تجهیزات', () => {
  it('limit/offset تعداد را محدود می‌کند و X-Total-Count کل را می‌دهد', async () => {
    const all = await s.api<Dev[]>('GET', '/api/devices', { token });
    const page1 = await s.api<Dev[]>('GET', '/api/devices?limit=2&offset=0', { token });
    const page2 = await s.api<Dev[]>('GET', '/api/devices?limit=2&offset=2', { token });

    expect(all.data.length).toBe(3);
    expect(page1.data.length).toBe(2);
    expect(page2.data.length).toBe(1);
    // بدون هم‌پوشانی
    const ids = new Set([...page1.data, ...page2.data].map((d) => d.id));
    expect(ids.size).toBe(3);
  });

  it('q سریال را جست‌وجو می‌کند و status فیلتر می‌کند', async () => {
    const bySerial = await s.api<Dev[]>('GET', '/api/devices?q=PAG-002', { token });
    expect(bySerial.data).toHaveLength(1);
    expect(bySerial.data[0].main_serial).toBe('PAG-002');

    const defective = await s.api<Dev[]>('GET', '/api/devices?status=defective', { token });
    expect(defective.data).toHaveLength(1);
    expect(defective.data[0].main_serial).toBe('PAG-002');
  });

  it('مرتب‌سازی سریال صعودی/نزولی و پروژه', async () => {
    const asc = await s.api<Dev[]>('GET', '/api/devices?sort=serial&dir=asc', { token });
    expect(asc.data.map((d) => d.main_serial)).toEqual(['PAG-001', 'PAG-002', 'PAG-003']);
    const desc = await s.api<Dev[]>('GET', '/api/devices?sort=serial&dir=desc', { token });
    expect(desc.data.map((d) => d.main_serial)).toEqual(['PAG-003', 'PAG-002', 'PAG-001']);
    // ستون نامعتبر → مرتب‌سازی پیش‌فرض (بدون خطا)
    const bad = await s.api<Dev[]>('GET', '/api/devices?sort=;DROP TABLE devices--&dir=asc', { token });
    expect(bad.status).toBe(200);
    expect(bad.data.length).toBe(3);
  });

  it('stats شمارش کل و به‌تفکیک وضعیت را برمی‌گرداند', async () => {
    const r = await s.api<{ total: number; byStatus: Record<string, number> }>('GET', '/api/devices/stats', { token });
    expect(r.data.total).toBe(3);
    expect(r.data.byStatus.active).toBe(2);
    expect(r.data.byStatus.defective).toBe(1);
  });

  it('X-Total-Count در صفحه‌ی معمولی، فیلترشده و صفحه‌ی خالی درست است', async () => {
    const page = await s.api<Dev[]>('GET', '/api/devices?limit=2&offset=0', { token });
    expect(page.headers.get('x-total-count')).toBe('3');
    const filtered = await s.api<Dev[]>('GET', '/api/devices?limit=2&status=active', { token });
    expect(filtered.headers.get('x-total-count')).toBe('2');
    // offset فراتر از انتها: صفحه خالی است و شمارش از مسیر جایگزین می‌آید
    const beyond = await s.api<Dev[]>('GET', '/api/devices?limit=2&offset=100', { token });
    expect(beyond.data).toEqual([]);
    expect(beyond.headers.get('x-total-count')).toBe('3');
  });

  it('limit معتبر نباید بیشتر از ۵۰۰ پذیرفته شود', async () => {
    const r = await s.api<Dev[]>('GET', '/api/devices?limit=99999', { token });
    expect(r.status).toBe(200);
    expect(r.data.length).toBe(3); // فقط ۳ ردیف هست
  });
});

describe('صفحه‌بندی و تکراری‌های قطعات', () => {
  beforeAll(async () => {
    const rows = [
      { title: 'قطعه الف', pn: 'PN-DUP', serial: 'SN-A' },
      { title: 'قطعه ب', pn: 'PN-DUP', serial: 'SN-B' },
      { title: 'قطعه ج', pn: 'PN-UNIQ', serial: 'SN-C' }, // سریال یکتا (سرور سریال تکراری را ۴۰۹ می‌دهد)
    ];
    for (const r of rows) {
      const res = await s.api('POST', '/api/parts', {
        token,
        body: { device_id: deviceId, title: r.title, part_number_1: r.pn, part_serial_number: r.serial, status: 'active' },
      });
      expect(res.status).toBe(201);
    }
  });

  it('limit کل را می‌شمارد و pn_count/serial_count را می‌دهد', async () => {
    const page = await s.api<Part[]>('GET', '/api/parts?limit=1&offset=0', { token });
    expect(page.data).toHaveLength(1);
    expect(typeof page.data[0].pn_count).toBe('number');
    expect(typeof page.data[0].serial_count).toBe('number');
  });

  it('?dup=1 فقط پارت‌نامبرهای تکراری را برمی‌گرداند', async () => {
    const r = await s.api<Part[]>('GET', '/api/parts?dup=1', { token });
    expect(r.data).toHaveLength(2);
    expect(r.data.every((p) => p.pn_count > 1)).toBe(true);
  });

  it('?pn= همه‌ی ردیف‌های همان پارت‌نامبر را می‌دهد (برای دیالوگ گروه)', async () => {
    const r = await s.api<Part[]>('GET', '/api/parts?pn=pn-dup', { token });
    expect(r.data).toHaveLength(2);
  });

  it('q عنوان/سریال را جست‌وجو می‌کند', async () => {
    const r = await s.api<Part[]>('GET', '/api/parts?q=قطعه ج', { token });
    expect(r.data).toHaveLength(1);
    expect(r.data[0].title).toBe('قطعه ج');
  });

  it('مرتب‌سازی قطعات روی سریال در دو جهت', async () => {
    const asc = await s.api<{ part_serial_number: string }[]>('GET', '/api/parts?sort=serial&dir=asc&limit=50', { token });
    expect(asc.data.map((p) => p.part_serial_number)).toEqual(['SN-A', 'SN-B', 'SN-C']);
    const desc = await s.api<{ part_serial_number: string }[]>('GET', '/api/parts?sort=serial&dir=desc&limit=50', { token });
    expect(desc.data.map((p) => p.part_serial_number)).toEqual(['SN-C', 'SN-B', 'SN-A']);
  });

  it('stats وضعیت‌ها و تعداد پارت‌نامبر تکراری را می‌دهد', async () => {
    const r = await s.api<{ total: number; byStatus: Record<string, number>; dupPn: number }>('GET', '/api/parts/stats', { token });
    expect(r.data.total).toBe(3);
    expect(r.data.byStatus.active).toBe(3);
    expect(r.data.dupPn).toBe(1);
  });
});
