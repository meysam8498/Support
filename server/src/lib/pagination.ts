// ============================================================
// کمکی صفحه‌بندی سمت سرور — یک منبع برای limit/offset و مرتب‌سازی
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// • بدون limit رفتار قبلی حفظ می‌شود (همه‌ی ردیف‌ها) تا مسیرهای قدیمی نشکنند.
// • سقف ۵۰۰ ردیف در هر صفحه؛ offset منفی = ۰.
// • ORDER BY فقط از نگاشت whitelist ساخته می‌شود (هیچ ورودی کاربر در SQL نمی‌نشیند).
// • شمارش کل با شمارش صفحه‌ای یک‌جا خوانده می‌شود (COUNT(*) OVER ()) — بدون
//   اجرای دوباره‌ی همان پرس‌وجو.
// ============================================================

export interface PageParams {
  /** null = صفحه‌بندی غیرفعال (همه‌ی ردیف‌ها) */
  limit: number | null;
  offset: number;
  /** ترتیب ستون‌ها با LIMIT/OFFSET یا رشته‌ی خالی */
  pageSql: string;
}

export const MAX_PAGE_SIZE = 500;

/** خواندن limit/offset از query-string */
export function pageParams(query: Record<string, unknown>, max = MAX_PAGE_SIZE): PageParams {
  const limitRaw = Number(query.limit);
  const offsetRaw = Number(query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), max) : null;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset, pageSql: limit !== null ? ` LIMIT ${limit} OFFSET ${offset}` : '' };
}

/**
 * ساخت ORDER BY از کلید مجاز.
 * کلید ناشناخته → ترتیب پیش‌فرض (بدون خطا، بدون تزریق). id به‌عنوان tie-break
 * اضافه می‌شود تا صفحه‌بندی با ردیف‌های هم‌مقدار پایدار بماند.
 */
export function orderBy(
  sortKey: string,
  dir: string,
  columns: Record<string, string>,
  fallback: { column: string; dir: 'ASC' | 'DESC' },
  idColumn: string,
): string {
  // ورودی می‌تواند 'asc'/'ASC' یا خالی باشد — نرمال می‌کنیم
  const normalized = dir.toLowerCase();
  const direction = normalized === 'asc' ? 'ASC' : normalized === 'desc' ? 'DESC' : '';
  const column = columns[sortKey];
  if (column) return `ORDER BY ${column} ${direction || 'ASC'}, ${idColumn} DESC`;
  return `ORDER BY ${fallback.column} ${direction || fallback.dir}, ${idColumn} DESC`;
}

/**
 * ستون total_count و مقدار کل را برمی‌گرداند.
 * صفحه‌ی خالی (offset فراتر از انتها) تعداد را ندارد → پرس‌وجوی شمارش جداگانه
 * با `countSql` (همان FROM/WHERE بدون ORDER) اجرا می‌شود.
 */
export function readTotal<T extends { total_count?: number }>(
  rows: T[],
  countSql: () => number,
): { rows: T[]; total: number } {
  const total = rows.length ? Number(rows[0].total_count ?? rows.length) : countSql();
  for (const row of rows) delete row.total_count;
  return { rows, total };
}
