// ============================================================
// نوار صفحه‌بندی — مشترک بین فهرست تجهیزات و قطعات
// «نمایش X–Y از N» + دکمه‌های قبلی/بعدی (بدون شماره‌ی صفحه)
// ============================================================
import React from 'react';
import { toFa } from '../lib/date';

interface Props {
  /** شماره‌ی صفحه از ۰ */
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
}

export default function PaginationBar({ page, pageSize, total, onPage }: Props) {
  if (total <= 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-stone-600 dark:text-stone-300">
      <span className="fa-nums">
        نمایش {toFa(from)}–{toFa(to)} از {toFa(total)}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary min-h-[32px] px-3 text-xs"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          قبلی
        </button>
        <button
          type="button"
          className="btn-secondary min-h-[32px] px-3 text-xs"
          onClick={() => onPage(page + 1)}
          disabled={(page + 1) * pageSize >= total}
        >
          بعدی
        </button>
      </div>
    </div>
  );
}
