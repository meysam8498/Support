// ============================================================
// سبم داده‌ی نمونه برای اسکن a11y:scan روی بیلد تازه — npm run a11y:seed
// ------------------------------------------------------------
// در DB خالی (مثل CI) قابل‌نگاشتِ صفحه‌های جزئیات 404 می‌خورد و گزارش
// پر از نویز شبکه می‌شود. این اسکریپت (idempotent) در صورت خالی بودن،
// با همان API خودِ اپ: یک تجهیز نمونه و یک قطعه‌ی نمونه می‌سازد تا
// شناسه‌کشف اسکنر (discoverIds) حقیقی شود و گزارش واقعی باشد.
// base: env A11Y_API (پیش‌فرض http://localhost:4000) — همان که اسکنر می‌خواند
// حساب: ADMIN_USERNAME/ADMIN_PASSWORD (پیش‌فرض admin/admin123 از seed سرور)
// ============================================================
const BASE = (process.env.A11Y_API || 'http://localhost:4000') + '/api';

const api = async (method, path, body, token) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text().catch(() => '')}`.slice(0, 200));
  return r.json();
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npm run a11y:seed   (env: A11Y_API، ADMIN_USERNAME، ADMIN_PASSWORD)');
  process.exit(0);
}

const login = await api('POST', '/auth/login', {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123',
});
const token = login.token;
if (!token) throw new Error('لاگین ناموفق — در DB دستی ADMIN_USERNAME/ADMIN_PASSWORD را ست نکرده‌اید');

const L = await api('GET', '/lists', undefined, token);
const devices = await api('GET', '/devices?limit=1', undefined, token);
const parts = await api('GET', '/parts?limit=1', undefined, token);

let deviceId = Array.isArray(devices) && devices[0]?.id;
if (deviceId) {
  console.log(`دیتابیس تجهیز دارد (id: ${deviceId}) — سبم رد شد.`);
} else {
  const pid = L.projects?.[0]?.id;
  const tid = L.deviceTypes?.[0]?.id;
  const mid = L.deviceModels?.[0]?.id;
  const bid = L.brands?.[0]?.id;
  if (!pid || !tid || !mid || !bid) throw new Error('لیست‌ها seed نشده‌اند — سرور با که db خالی آپ شده؟ seedIfEmpty باید پر کند');
  const created = await api('POST', '/devices', { project_id: pid, device_type_id: tid, device_model_id: mid, brand_id: bid }, token);
  deviceId = created.id;
  console.log('تجهیز نمونه ساخته شد — id:', deviceId, '(برند/مودل/پروژه‌ی نمونه‌ی خودِ seed)');
}

let partId = Array.isArray(parts) && parts[0]?.id;
if (partId) {
  console.log(`دیتابیس قطعه دارد (id: ${partId}) — سبم رد شد.`);
} else {
  const created = await api('POST', '/parts', { device_id: deviceId, title: 'قطعه‌ی نمونه', part_number_1: 'PN-DEMO-1' }, token);
  partId = created.id;
  console.log('قطعه‌ی نمونه ساخته شد — id:', partId);
}
console.log(`سبم کامل: A11Y_API=${BASE} — تجهیز ${deviceId} + قطعه ${partId}`);
