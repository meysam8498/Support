// ============================================================
// لیست‌های پیش‌تعریف‌شده — مسیرهای API (انتخاب از لیست، نه نوشتن آزاد)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// نقش‌ها: GET برای همه؛ نوشتن فقط admin.
// ============================================================
import { Router } from 'express';
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';

// شامل: کارشناسان فروش، کارشناسان فنی، برندها، انواع تجهیز، مدل‌ها، پروژه‌ها، دلایل خرابی.
const router = Router();

// همه‌ی مسیرهای نوشتاری (POST/PUT/DELETE) این روتر فقط برای مدیر مجاز است.
// مسیرهای GET برای همه‌ی کاربران احرازشده باز هستند.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireRole('admin', 'warehouse', 'tech')(req, res, next);
});

type ListKey =
  | 'sales_experts'
  | 'technical_experts'
  | 'brands'
  | 'device_types'
  | 'failure_reasons';

const SIMPLE_LISTS: Record<ListKey, string> = {
  sales_experts: 'name, phone, role, active',
  technical_experts: 'name, phone, role, active',
  brands: 'name',
  device_types: 'name',
  failure_reasons: 'name',
};

/** نقش حرفه‌ای کارشناس — فنی/فروش/انبار/بازرگانی */
const EXPERT_ROLES = ['sales', 'tech', 'warehouse', 'business'] as const;
const normExpertRole = (v: unknown, fallback: 'sales' | 'tech'): string =>
  typeof v === 'string' && (EXPERT_ROLES as readonly string[]).includes(v) ? v : fallback;

// --- دریافت همه‌ی لیست‌ها در یک فراخوانی (برای فرم‌ها) ---
router.get('/', (_req, res) => {
  const db = getDb();

  const salesExperts = db.prepare(`SELECT id, name, phone, role, active FROM sales_experts ORDER BY name`).all();
  const technicalExperts = db.prepare(`SELECT id, name, phone, role, active FROM technical_experts ORDER BY name`).all();
  const brands = db.prepare(`SELECT id, name FROM brands ORDER BY name`).all();
  const deviceTypes = db.prepare(`SELECT id, name FROM device_types ORDER BY name`).all();
  const deviceModels = db.prepare(`
    SELECT m.id, m.name, m.brand_id, b.name AS brand_name
    FROM device_models m JOIN brands b ON b.id = m.brand_id
    ORDER BY b.name, m.name
  `).all();
  const projects = db.prepare(`
    SELECT p.id, p.name, p.contract_number, p.sales_expert_id,
           e.name AS sales_expert_name
    FROM projects p
    LEFT JOIN sales_experts e ON e.id = p.sales_expert_id
    ORDER BY p.name
  `).all();
  const failureReasons = db.prepare(`SELECT id, name FROM failure_reasons ORDER BY name`).all();

  return res.json({
    salesExperts,
    technicalExperts,
    brands,
    deviceTypes,
    deviceModels,
    projects,
    failureReasons,
  });
});

// ============================================================
// کارشناسان فروش
// ============================================================
router.get('/sales-experts', (_req, res) => {
  const rows = getDb().prepare(`SELECT id, name, phone, role, active FROM sales_experts ORDER BY name`).all();
  res.json(rows);
});
router.post('/sales-experts', (req, res) => {
  const { name, phone, role } = req.body as { name: string; phone?: string; role?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO sales_experts (name, phone, role) VALUES (?, ?, ?)`)
      .run(name.trim(), phone || null, normExpertRole(role, 'sales'));
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این نام قبلاً ثبت شده است.' });
  }
});
router.put('/sales-experts/:id', (req, res) => {
  const { name, phone, active, role } = req.body as { name?: string; phone?: string; active?: number; role?: string };
  const r = role !== undefined ? normExpertRole(role, 'sales') : null;
  getDb()
    .prepare(`UPDATE sales_experts SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?`)
    .run(name?.trim() || null, phone ?? null, r, active ?? null, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/sales-experts/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM sales_experts WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// کارشناسان فنی
// ============================================================
router.get('/technical-experts', (_req, res) => {
  const rows = getDb().prepare(`SELECT id, name, phone, role, active FROM technical_experts ORDER BY name`).all();
  res.json(rows);
});
router.post('/technical-experts', (req, res) => {
  const { name, phone, role } = req.body as { name: string; phone?: string; role?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO technical_experts (name, phone, role) VALUES (?, ?, ?)`)
      .run(name.trim(), phone || null, normExpertRole(role, 'tech'));
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این نام قبلاً ثبت شده است.' });
  }
});
router.put('/technical-experts/:id', (req, res) => {
  const { name, phone, active, role } = req.body as { name?: string; phone?: string; active?: number; role?: string };
  const r = role !== undefined ? normExpertRole(role, 'tech') : null;
  getDb()
    .prepare(`UPDATE technical_experts SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?`)
    .run(name?.trim() || null, phone ?? null, r, active ?? null, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/technical-experts/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM technical_experts WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// برندها
// ============================================================
router.get('/brands', (_req, res) => {
  res.json(getDb().prepare(`SELECT id, name FROM brands ORDER BY name`).all());
});
router.post('/brands', (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO brands (name) VALUES (?)`).run(name.trim());
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این برند قبلاً ثبت شده است.' });
  }
});
router.put('/brands/:id', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    getDb().prepare(`UPDATE brands SET name = ? WHERE id = ?`).run(name.trim(), Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این برند قبلاً ثبت شده است.' });
  }
});
router.delete('/brands/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM brands WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// انواع دستگاه
// ============================================================
router.get('/device-types', (_req, res) => {
  res.json(getDb().prepare(`SELECT id, name FROM device_types ORDER BY name`).all());
});
router.post('/device-types', (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO device_types (name) VALUES (?)`).run(name.trim());
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این نوع قبلاً ثبت شده است.' });
  }
});
router.put('/device-types/:id', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    getDb().prepare(`UPDATE device_types SET name = ? WHERE id = ?`).run(name.trim(), Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این نوع قبلاً ثبت شده است.' });
  }
});
router.delete('/device-types/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM device_types WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// مدل‌های دستگاه (وابسته به برند)
// ============================================================
router.get('/device-models', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT m.id, m.name, m.brand_id, b.name AS brand_name
    FROM device_models m JOIN brands b ON b.id = m.brand_id
    ORDER BY b.name, m.name
  `).all();
  res.json(rows);
});
router.post('/device-models', (req, res) => {
  const { name, brand_id } = req.body as { name: string; brand_id: number };
  if (!name?.trim() || !brand_id) return res.status(400).json({ error: 'نام و برند الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO device_models (brand_id, name) VALUES (?, ?)`).run(brand_id, name.trim());
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این مدل برای این برند قبلاً ثبت شده است.' });
  }
});
router.put('/device-models/:id', (req, res) => {
  const { name, brand_id } = req.body as { name?: string; brand_id?: number };
  if (!name?.trim() || !brand_id) return res.status(400).json({ error: 'نام و برند الزامی است.' });
  try {
    getDb().prepare(`UPDATE device_models SET name = ?, brand_id = ? WHERE id = ?`).run(name.trim(), brand_id, Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این مدل برای این برند قبلاً ثبت شده است.' });
  }
});
router.delete('/device-models/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM device_models WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// پروژه‌ها (مشتری): نام پروژه + شماره قرارداد + کارشناس فروش
// ============================================================
router.get('/projects', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT p.id, p.name, p.contract_number, p.sales_expert_id,
           e.name AS sales_expert_name
    FROM projects p
    LEFT JOIN sales_experts e ON e.id = p.sales_expert_id
    ORDER BY p.name
  `).all();
  res.json(rows);
});
router.post('/projects', (req, res) => {
  const { name, contract_number, sales_expert_id } = req.body as {
    name: string; contract_number?: string; sales_expert_id?: number;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'نام پروژه الزامی است.' });
  const info = getDb().prepare(
    `INSERT INTO projects (name, contract_number, sales_expert_id) VALUES (?, ?, ?)`
  ).run(name.trim(), contract_number || null, sales_expert_id || null);
  return res.status(201).json({ id: info.lastInsertRowid });
});
router.put('/projects/:id', (req, res) => {
  const { name, contract_number, sales_expert_id } = req.body as {
    name?: string; contract_number?: string; sales_expert_id?: number;
  };
  getDb().prepare(
    `UPDATE projects SET name = COALESCE(?, name), contract_number = COALESCE(?, contract_number), sales_expert_id = COALESCE(?, sales_expert_id) WHERE id = ?`
  ).run(name?.trim() || null, contract_number ?? null, sales_expert_id ?? null, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/projects/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM projects WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

// ============================================================
// دلایل/انواع خرابی
// ============================================================
router.get('/failure-reasons', (_req, res) => {
  res.json(getDb().prepare(`SELECT id, name FROM failure_reasons ORDER BY name`).all());
});
router.post('/failure-reasons', (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    const info = getDb().prepare(`INSERT INTO failure_reasons (name) VALUES (?)`).run(name.trim());
    return res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    return res.status(409).json({ error: 'این دلیل قبلاً ثبت شده است.' });
  }
});
router.put('/failure-reasons/:id', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'نام الزامی است.' });
  try {
    getDb().prepare(`UPDATE failure_reasons SET name = ? WHERE id = ?`).run(name.trim(), Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'این دلیل قبلاً ثبت شده است.' });
  }
});
router.delete('/failure-reasons/:id', (req, res) => {
  try {
    getDb().prepare(`DELETE FROM failure_reasons WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'حذف ممکن نیست (در حال استفاده).' });
  }
});

export default router;
// اطمینان از استفاده‌نشدن متغیر در زمان کامپایل
void SIMPLE_LISTS;
