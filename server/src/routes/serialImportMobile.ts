// ============================================================
// ورود سریال از اپ موبایل (بارکدخوان) — MVP (۱.۲۶)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// POST /api/serial-import/mobile
//   بدنه: { serial: string (الزامی), project_id?: number }
//   احراز هویت: همان JWT وب — نقش‌های admin/warehouse/tech
//   رفتار: جست‌وجوی سریال در قطعات (part_serial_number) و سریال اصلی
//     تجهیزات (main_serial)؛ اگر قطعه پیدا شد log فعال‌سازی با
//     source: 'mobile' ثبت می‌شود (طبق PACKAGING.md بخش ۲) و خلاصه‌ی
//     قطعه/تجهیز/پروژه برمی‌گردد؛ وگرنه 404 با پیام فارسی.
//   این endpoint داده‌ی جدیدی نمی‌سازد — فقط شناسایی + ثبت رخداد.
//   (ثبت سریال واقعیِ جدید در MVP بعدی، پس از انتخاب تجهیز در UI اپ)
// ============================================================
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

interface MobilePartRow {
  id: number;
  device_id: number;
  title: string;
  part_number_1: string | null;
  part_serial_number: string | null;
  status: string;
  device_main_serial: string | null;
  project_id: number;
  project_name: string | null;
}

interface MobileDeviceRow {
  id: number;
  main_serial: string | null;
  project_id: number;
  project_name: string | null;
}

/** پاک‌سازی نویسه‌های نامرئی و فاصله‌ی سر و ته — بارکدها گاهی نویسه اضافه دارند */
function cleanSerial(raw: string): string {
  return raw
    .replace(/[\u200c\u200f\u200e\uFEFF]/g, '')
    .trim();
}

/** ساخت جدول log در صورت نبود — idempotent؛ در هر دو مسیر POST/GET فراخوانی می‌شود */
function ensureLogTable(db: ReturnType<typeof getDb>): void {
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_scan_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    serial     TEXT NOT NULL,
    part_id    INTEGER,
    device_id  INTEGER,
    project_id INTEGER,
    source     TEXT NOT NULL DEFAULT 'mobile',
    scanned_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

// POST /api/serial-import/mobile — اسکن → شناسایی سریال + ثبت log با source=mobile
router.post('/mobile', requireRole('admin', 'warehouse', 'tech'), (req: Request, res: Response) => {
  const schema = z.object({
    serial: z.string().min(1).max(120),
    project_id: z.coerce.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'سریال ارسال نشده است.' });
    return;
  }
  const serial = cleanSerial(parsed.data.serial);
  const projectId = parsed.data.project_id;
  if (!serial) {
    res.status(400).json({ error: 'سریال خالی است.' });
    return;
  }

  const db = getDb();

  // جست‌وجو: اول سریال قطعه، بعد سریال اصلی تجهیز (با نرمال‌سازی فاصله‌ها)
  const part = db
    .prepare(
      `SELECT pa.id, pa.device_id, pa.title, pa.part_number_1, pa.part_serial_number, pa.status,
              d.main_serial AS device_main_serial, d.project_id, p.name AS project_name
       FROM parts pa
       JOIN devices d ON d.id = pa.device_id
       LEFT JOIN projects p ON p.id = d.project_id
       WHERE REPLACE(pa.part_serial_number, ' ', '') = ?
       ORDER BY pa.id
       LIMIT 1`
    )
    .get(serial.replace(/\s+/g, '')) as MobilePartRow | undefined;

  let deviceRow: MobileDeviceRow | undefined;
  if (!part) {
    deviceRow = db
      .prepare(
        `SELECT d.id, d.main_serial, d.project_id, p.name AS project_name
         FROM devices d LEFT JOIN projects p ON p.id = d.project_id
         WHERE REPLACE(d.main_serial, ' ', '') = ?
         ORDER BY d.id LIMIT 1`
      )
      .get(serial.replace(/\s+/g, '')) as MobileDeviceRow | undefined;
  }

  if (!part && !deviceRow) {
    res.status(404).json({
      error: 'این سریال در سامانه پیدا نشد — دوباره اسکن کنید یا دستی وارد کنید.',
      serial,
      found: false,
    });
    return;
  }

  // ثبت log فعال‌سازی موبایل
  ensureLogTable(db);
  db.prepare(
    `INSERT INTO mobile_scan_log (serial, part_id, device_id, project_id, source, scanned_by)
     VALUES (?, ?, ?, ?, 'mobile', ?)`
  ).run(
    serial,
    part?.id ?? null,
    part?.device_id ?? deviceRow?.id ?? null,
    projectId ?? part?.project_id ?? deviceRow?.project_id ?? null,
    req.user?.sub ?? null,
  );

  res.json({
    ok: true,
    found: true,
    source: 'mobile',
    match: part
      ? {
          kind: 'part' as const,
          part: {
            id: part.id,
            title: part.title,
            part_number: part.part_number_1,
            serial: part.part_serial_number,
            status: part.status,
          },
          device: { id: part.device_id, main_serial: part.device_main_serial },
          project: { id: part.project_id, name: part.project_name },
        }
      : {
          kind: 'device' as const,
          device: { id: deviceRow!.id, main_serial: deviceRow!.main_serial },
          project: { id: deviceRow!.project_id, name: deviceRow!.project_name },
        },
  });
});

// GET /api/serial-import/mobile/logs — آخرین اسکن‌های موبایل (برای پیگیری/دیباگ)
router.get('/mobile/logs', requireRole('admin', 'warehouse', 'tech'), (_req: Request, res: Response) => {
  const db = getDb();
  ensureLogTable(db);
  const rows = db
    .prepare(
      `SELECT id, serial, part_id, device_id, project_id, source, scanned_by, created_at
       FROM mobile_scan_log ORDER BY id DESC LIMIT 100`
    )
    .all();
  res.json({ ok: true, items: rows });
});

export default router;
