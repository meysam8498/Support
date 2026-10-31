// ============================================================
// نشان «آخرین همگام‌سازی» — یک قطعه‌ی واحد برای همه‌ی جاها:
// نوار ابزار تخته‌ی داشبورد + صفحات پشتیبان‌گیری / لاگ‌ویور / گزارش‌ها، تا زمان
// همگام‌سازی همیشه قابل‌روایت بماند. کلیک، تاریخ کامل (شمسی/میلادی) را باز/می‌بندد —
// همان رفتار قابل‌کلیکِ زنجیره‌ی نشان‌ها: وضعیت آفلاین/در حال ذخیره و گزارش PUTهای ناموفق.
// بدون مقدار (هرگز همگام نشده) چیزی رندر نمی‌شود — زمانِ غلط نشان داده نمی‌شود.
// ============================================================
import React, { useState } from 'react';
import { formatSyncedDetails, formatSyncedTime } from '../lib/date';

export default function LastSyncedBadge({ iso }: { iso: string | null }) {
  // حالت باز/بسته‌ی داخلی — هر جای صفحه مستقل باز/بسته می‌شود
  const [open, setOpen] = useState(false);
  if (!iso) return null;
  return (
    <button
      type="button"
      data-testid="last-synced"
      aria-expanded={open}
      title="نمایش تاریخ و زمان کامل"
      onClick={() => setOpen((o) => !o)}
      className="inline-flex flex-col items-start gap-0.5 text-[11px] text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded-lg px-1.5 -mx-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="inline-flex items-center gap-1">✓ آخرین همگام‌سازی: {formatSyncedTime(iso)}</span>
      {open && (
        <span data-testid="last-synced-detail">
          📅 {formatSyncedDetails(iso)}
        </span>
      )}
    </button>
  );
}
