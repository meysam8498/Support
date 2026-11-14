// ============================================================
// لاگ ممیزی کسب‌وکار — چه کسی، کِی، چه درخواست نوشتنی‌ای زد و نتیجه چه بود
// فقط متادیتای درخواست ثبت می‌شود (نه مقدار رمز/توکن/کد لایسنس).
// حلقه‌ی لاگ سرور در حافظه است و با ری‌استارت پاک می‌شود؛ این جدول ماندگار است.
// ============================================================
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/db.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** کلیدهایی که مقدارشان هرگز نباید در لاگ بیاید */
const SENSITIVE = /pass|token|secret|code|authorization|signature|pem|private/i;

const MAX_ROWS = 5000;
let inserts = 0;

/** خلاصه‌ی امن بدنه: فقط کلیدها + مقادیر کوتاهِ غیرحساس */
function summarize(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE.test(k)) { out[k] = '***'; continue; }
    if (typeof v === 'string' && v.length > 60) { out[k] = `${v.slice(0, 60)}…`; continue; }
    if (v && typeof v === 'object') { out[k] = Array.isArray(v) ? `[${v.length}]` : '{…}'; continue; }
    out[k] = v;
  }
  const s = JSON.stringify(out);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

function write(req: Request, status: number): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_log (user_id, username, method, path, status, summary, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user?.sub ?? null,
      req.user?.username ?? null,
      req.method,
      req.originalUrl.split('?')[0],
      status,
      summarize(req.body),
      req.ip ?? null
    );
    // هر ۲۰۰ ثبت، ردیف‌های قدیمی حذف می‌شوند تا جدول بی‌نهایت رشد نکند
    if (++inserts % 200 === 0) {
      db.prepare(`DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ?)`).run(MAX_ROWS);
    }
  } catch (e) {
    // لاگ نباید مسیر اصلی را بشکند
    console.error('[audit] ثبت نشد:', (e as Error).message);
  }
}

/**
 * میان‌افزار ثبت: بعد از پایان پاسخ نوشتنیِ احراز‌شده اجرا می‌شود.
 * req.user را authRequired در مسیر تنظیم می‌کند، پس در رویداد finish در دسترس است.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  res.on('finish', () => {
    if (!req.user) return; // ورود/درخواست‌های بی‌هویت لاگ نمی‌شوند
    write(req, res.statusCode);
  });
  next();
}

/** آخرین رخدادها — جدیدترین اول */
export function listAudit(limit = 100): unknown[] {
  return getDb()
    .prepare(`SELECT id, at, user_id, username, method, path, status, summary, ip FROM audit_log ORDER BY id DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 500));
}