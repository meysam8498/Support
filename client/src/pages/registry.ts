// ============================================================
// رجیستری چانک‌های lazy صفحات — منبع واحدِ React.lazy و prefetch هنگام hover
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ------------------------------------------------------------
// • App صفحات سنگین را از همین‌جا می‌گیرد تا چانک‌ها از باندل اولیه جدا بمانند
//   (بودجه‌ی هر چانک: scripts/check-bundle-budget.mjs)
// • Layout روی hover/focus آیتم منو همان import را از پیش اجرا می‌کند
//   (prefetchChunk) تا کلیک بعدی بدون مکث از Suspense بگذرد: import پویای
//   تکراری همان URL مدول را می‌آورد و در کش ماژول مرورگر هم‌زمان resolve
//   می‌شود — هزینه‌ی هر هاور چند کیلوبایت و فقط یک بار در نشست است.
// • مسیرهای بدون چانک جدا (صفحات ایستا) بی‌صدا no-op می‌شوند؛ صدا زدن
//   prefetchProps روی همه‌ی لینک‌ها امن است.
// ============================================================
import React from 'react';

interface ChunkEntry {
  /** کلید یکتای چانک — پایه‌ی جلوگیری از درخواست تکراری */
  key: string;
  /** نگاشت مسیر به این چانک (تطبیق دقیق یا پسوند مسیر) */
  match: (pathname: string) => boolean;
  /** همان import پویایی که React.lazy استفاده می‌کند — بارگذاری مشترک */
  load: () => Promise<unknown>;
}

// importers — نام صریح تا هم React.lazy و هم CHUNK_LOADERS از یک تابع استفاده کنند
const loadReports = () => import('./ReportsPage');
const loadSerialImport = () => import('./SerialImportPage');
const loadLogViewer = () => import('./LogViewerPage');
const loadIssue = () => import('./IssuePage');
const loadPartsGrid = () => import('./PartsGridEditor');
const loadBackups = () => import('./BackupsPage');
const loadWarrantyReplace = () => import('./WarrantyReplacePage');

// صفحات سنگین با React.lazy از چانک اولیه (index) جدا می‌شوند و فقط هنگام
// ورود به مسیرشان دانلود می‌شوند — با prefetch هنگام hover، این ورود بی‌مکث است
export const ReportsPage = React.lazy(loadReports);
export const SerialImportPage = React.lazy(loadSerialImport);
export const LogViewerPage = React.lazy(loadLogViewer);
export const IssuePage = React.lazy(loadIssue);
export const PartsGridEditor = React.lazy(loadPartsGrid);
export const BackupsPage = React.lazy(loadBackups);
export const WarrantyReplacePage = React.lazy(loadWarrantyReplace);

/** نگاشت مسیر → چانک — هم prefetchChunk از این فهرست می‌خواند، هم تست‌ها جاسوسی می‌کنند */
export const CHUNK_LOADERS: ChunkEntry[] = [
  { key: '/reports', match: (p) => p === '/reports', load: loadReports },
  { key: '/serial-import', match: (p) => p === '/serial-import', load: loadSerialImport },
  { key: '/logs', match: (p) => p === '/logs', load: loadLogViewer },
  { key: '/issue', match: (p) => p === '/issue', load: loadIssue },
  { key: '/backups', match: (p) => p === '/backups', load: loadBackups },
  { key: '/warranty/replace', match: (p) => p === '/warranty/replace', load: loadWarrantyReplace },
  // گرید قطعات زیر devices/:id/parts-grid — شناسه‌ی تجهیز در مسیر ثابت نیست → پسوند
  { key: 'parts-grid', match: (p) => p.endsWith('/parts-grid'), load: loadPartsGrid },
];

/** مسیرهای گرم‌شده در همین نشست — hover/focus تکراری درخواست دوم نمی‌فرستد */
export const WARMED_CHUNKS = new Set<string>();

/**
 * گرم‌کردن چانک صفحه‌ی lazy قبل از کلیک — روی hover/focus آیتم منو صدا می‌شود.
 * مسیر بدون چانک = صفحه‌ی ایستا → بی‌صدا برمی‌گردد. اگر بارگذاری شکست بخورد،
 * مسیر از فهرست گرم‌شده‌ها حذف می‌شود تا هاور بعدی دوباره تلاش کند.
 */
export function prefetchChunk(pathname: string): void {
  const entry = CHUNK_LOADERS.find((e) => e.match(pathname));
  if (!entry || WARMED_CHUNKS.has(entry.key)) return;
  WARMED_CHUNKS.add(entry.key);
  void entry.load().catch(() => WARMED_CHUNKS.delete(entry.key));
}

/**
 * ویژگی‌های hover/focus برای لینک‌ها — روی هر لینکِ به مقصد lazy پخش کنید تا
 * چانک با نشانگر موس (یا Tab کیبورد) گرم شود. صفحات ایستا no-op می‌شوند.
 */
export function prefetchProps(pathname: string) {
  return {
    onMouseEnter: () => prefetchChunk(pathname),
    onFocus: () => prefetchChunk(pathname),
  };
}
