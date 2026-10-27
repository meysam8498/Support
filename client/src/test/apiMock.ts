// ============================================================
// جایگزین شبکه برای تست‌ها — fetch سراسری با fixtureهای واقع‌گرایانه
// ------------------------------------------------------------
// • هر اندپوینتی که صفحات هنگام رندر می‌خوانند اینجا پاسخ دارد؛
//   ناشناخته‌ها {} (GET) یا { ok: true } (بقیه) برمی‌گردانند تا صفحه نشکند.
// • ترتیب مهم است: `/parts/1` (جزئیات) قبل از `/parts?...` (فهرست).
// • داده‌ها عمداً کوچک ولی کامل‌اند تا رندر واقعی (جدول/فهرست/فرم) انجام شود.
// ============================================================
import { vi } from 'vitest';

export const ISO_NOW = '2026-10-18T06:00:00.000Z';

export const adminUser = {
  id: 1,
  username: 'admin',
  fullName: 'مدیر سیستم',
  email: 'admin@test.local',
  role: 'admin',
  active: 1,
};

export const deviceFixture = {
  id: 1,
  project_id: 1,
  project_name: 'پروژه‌ی تست',
  contract_number: 'C-1404-001',
  sales_expert_id: 1,
  sales_expert_name: 'کارشناس فروش',
  main_serial: 'SN-0001',
  part_number_1: 'PN-001',
  device_type_id: 1,
  device_type_name: 'سرور',
  device_model_id: 1,
  device_model_name: 'R650',
  brand_id: 1,
  brand_name: 'دِل',
  technical_expert_id: 1,
  technical_expert_name: 'کارشناس فنی',
  warehouse_exit_jalali: '1404/01/10',
  customer_delivery_jalali: '1404/01/15',
  warranty_duration_months: 12,
  warranty_start_jalali: '1404/01/15',
  warranty_start_gregorian: '2026-04-04',
  warranty_end_jalali: '1405/01/14',
  warranty_end_gregorian: '2027-04-03',
  status: 'active',
  parts_count: 1,
  replacements_count: 1,
  warranty_requests_count: 1,
};

export const partFixture = {
  id: 1,
  device_id: 1,
  title: 'ماژول حافظه HIST DIMM',
  tech_specs: '16GB DDR4',
  part_number_1: 'PN-001',
  part_serial_number: 'PS-0001',
  status: 'active',
  sold_at_jalali: '1404/01/15',
  device_serial: 'SN-0001',
  device_type_name: 'سرور',
  brand_name: 'دِل',
  project_name: 'پروژه‌ی تست',
};

export const replacementFixture = {
  id: 1,
  device_id: 1,
  old_part_id: 1,
  new_part_id: 2,
  old_part_title: 'ماژول حافظه قدیمی',
  old_part_serial: 'PS-0001',
  new_part_title: 'ماژول حافظه جدید',
  new_part_serial: 'PS-0002',
  replaced_at_jalali: '1404/07/01',
  replaced_at_gregorian: '2026-09-22',
  expert_name: 'کارشناس فنی',
  failure_reason_name: 'خرابی سخت‌افزاری',
  device_serial: 'SN-0001',
  project_name: 'پروژه‌ی تست',
};

const listsFixture = {
  salesExperts: [{ id: 1, name: 'کارشناس فروش', active: 1 }],
  technicalExperts: [{ id: 1, name: 'کارشناس فنی', active: 1 }],
  brands: [{ id: 1, name: 'دِل', active: 1 }],
  deviceTypes: [{ id: 1, name: 'سرور', active: 1 }],
  deviceModels: [{ id: 1, name: 'R650', brand_id: 1 }],
  projects: [{ id: 1, name: 'پروژه‌ی تست', contract_number: 'C-1404-001' }],
  failureReasons: [{ id: 1, name: 'خرابی سخت‌افزاری', active: 1 }],
};

const licenseFixture = {
  plan: 'year',
  plan_label: 'یک‌ساله',
  days_left: 120,
  expired: false,
  licensed_to: 'مشتری تست',
  notes: null,
  starts_at: '1404/01/01',
  expires_at: '1405/01/01',
};

const backupsFixture = {
  dir: '/data/backups',
  keep: 30,
  atHour: 3,
  lastRun: ISO_NOW,
  lastResult: { ok: true, file: 'support-backup-20261018-033000.db', sizeBytes: 294912, integrity: 'ok', push: { ok: true, target: '', kind: 'dir' } },
  count: 2,
  push: { target: '', enabled: false, last: null },
  items: [
    { file: 'support-backup-20261018-033000.db', sizeBytes: 294912, mtime: ISO_NOW },
    { file: 'support-backup-20261017-033000.db', sizeBytes: 290816, mtime: '2026-10-17T00:00:00.000Z' },
  ],
  history: [
    { ranAt: ISO_NOW, source: 'daily', ok: true, file: 'support-backup-20261018-033000.db', sizeBytes: 294912, integrity: 'ok', durationMs: 25, error: null, pushOk: null, pushTarget: null, pushError: null },
    { ranAt: '2026-10-17T00:00:00.000Z', source: 'daily', ok: true, file: 'support-backup-20261017-033000.db', sizeBytes: 290816, integrity: 'ok', durationMs: 24, error: null, pushOk: null, pushTarget: null, pushError: null },
  ],
  history_meta: { total: 2, keep: 500, capped: false },
};

/** [method, regex-path, response] — به‌ترتیب اولویت؛ اولین تطبیق برنده است */
type Route = [method: string, path: RegExp, data: () => unknown];

const ROUTES: Route[] = [
  ['GET', /^\/version$/, () => ({ version: '0.0.0-test', server_version: '1.0.0-test', support_only: false })],
  ['GET', /^\/license\/device-limit$/, () => ({ limit: null, used: 2, remaining: null, is_trial: false, enforce: false })],
  ['GET', /^\/license\/keys\/status$/, () => ({ current_kid: 'aabbccdd', accepted_kids: ['aabbccdd', '11223344'], accepted_count: 2, has_issue_key: true, keys_dir: '/keys' })],
  ['GET', /^\/license\/keys\/rotations$/, () => ({
    path: '/keys/rotations.jsonl', exists: true, count: 1, invalid_lines: 0, current_kid: 'aabbccdd',
    rotations: [{ rotated_at: '2026-09-01T10:00:00.000Z', old_kid: '11223344', new_kid: 'aabbccdd', archived_pub: '/keys/accepted/11223344.pem', archive_ok: true, by: 'admin-panel' }],
  })],
  ['GET', /^\/license\/issued$/, () => ([{
    id: 1, jti: 'jti-test-1', plan: 'year', licensed_to: 'مشتری تست', email: 'c@d.e', note: 'فاکتور ۱',
    code_days: 365, issued_at: '2026-09-01T10:00:00.000Z', issued_by_name: 'مدیر سیستم', activated: 1, revoked: false,
  }])],
  ['GET', /^\/license$/, () => licenseFixture],
  ['GET', /^\/backups$/, () => backupsFixture],
  ['GET', /^\/dashboard\/stats$/, () => ({ devices: 2, parts: 5, activeParts: 4, replacements: 1, projects: 1 })],
  ['GET', /^\/dashboard\/by-customer/, () => ({ project: listsFixture.projects[0], devices: [deviceFixture], parts: [partFixture], services: [replacementFixture] })],
  ['GET', /^\/lists$/, () => listsFixture],
  ['GET', /^\/reports\/summary$/, () => ({ totalReplacements: 1, totalParts: 5, replacedParts: 1, activeParts: 4, customersWithClaims: 1, recentReplacements: [{ replaced_at_jalali: '1404/07/01', part_title: 'ماژول حافظه قدیمی', project_name: 'پروژه‌ی تست' }] })],
  ['GET', /^\/reports\/most-failed-parts/, () => ([{ part_title: 'ماژول حافظه HIST DIMM', part_number_1: 'PN-001', replacement_count: 2, affected_devices: 1 }])],
  ['GET', /^\/reports\/replacement-trend/, () => ({ months: [{ year: 1404, month: 7, label: 'مهر', count: 1 }], total: 1, since: '1403/08/01', until: '1404/07/26' })],
  ['GET', /^\/reports\/failures-by-customer/, () => ([{ project_id: 1, project_name: 'پروژه‌ی تست', claims_count: 1, affected_devices: 1, distinct_failures: 1 }])],
  ['GET', /^\/reports\/failures-by-reason/, () => ([{ failure_reason_id: 1, failure_reason_name: 'خرابی سخت‌افزاری', replacement_count: 1, affected_devices: 1, affected_customers: 1 }])],
  ['GET', /^\/reports\/service-needs-by-type/, () => ([{ device_type_id: 1, device_type_name: 'سرور', total_devices: 2, total_parts: 5, total_replacements: 1, replacements_per_device: 0.5 }])],
  ['GET', /^\/warranty\/replacements/, () => ([replacementFixture])],
  ['GET', /^\/warranty\/requests/, () => ([{ id: 1, device_id: 1, device_serial: 'SN-0001', project_name: 'پروژه‌ی تست', description: 'درخواست تست', status: 'pending', request_jalali: '1404/07/02' }])],
  ['GET', /^\/procurement/, () => ([{ id: 1, part_id: 1, part_title: 'ماژول حافظه', source: 'internal', purchase_jalali: '1404/07/03', created_at: ISO_NOW }])],
  ['GET', /^\/parts\/(\d+)$/, () => ({ part: partFixture, chain: [partFixture], replacements: [replacementFixture] })],
  ['GET', /^\/parts(\?|$)/, () => ([partFixture])],
  ['GET', /^\/devices\/(\d+)$/, () => ({ device: deviceFixture, parts: [partFixture], replacements: [replacementFixture], warrantyRequests: [] })],
  ['GET', /^\/devices(\?|$)/, () => ([deviceFixture])],
  ['GET', /^\/users$/, () => ([adminUser])],
  ['GET', /^\/logs/, () => ({ version: 'test', total: 0, entries: [] })],
];

// ─────────── بازنویسی مسیر برای تست‌های ایزوله ───────────
// بعضی تست‌ها باید فقط یک مسیر را طور دیگری ببینند (مثلاً مسیر خطای بکاپ) بدون
// دست‌زدن به بقیه‌ی fixturesها. overrideRoute از همان الگوی Route استفاده می‌کند و
// همیشه «قبل از» ROUTES چک می‌شود؛ در afterEach با clearRouteOverrides پاک شود.
const OVERRIDES: Route[] = [];

export function overrideRoute(method: string, path: RegExp, data: () => unknown): void {
  OVERRIDES.unshift([method, path, data]);
}

export function clearRouteOverrides(): void {
  OVERRIDES.length = 0;
}

function lookup(method: string, path: string): unknown {
  for (const [m, re, data] of OVERRIDES) {
    if (m === method && re.test(path)) return data();
  }
  for (const [m, re, data] of ROUTES) {
    if (m === method && re.test(path)) return data();
  }
  return method === 'GET' ? {} : { ok: true };
}

/** نصب fetch سراسری — از setup.ts برای هر فایل تست فراخوانی می‌شود */
export function installApiMock(): void {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
    const method = (init?.method || 'GET').toUpperCase();
    const data = lookup(method, path);
    return {
      ok: true,
      status: 200,
      json: async () => data,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', mock);
}
