// ============================================================
// سرستون مرتب‌سازی — مشترک بین فهرست تجهیزات و قطعات
// مرتب‌سازی سمت سرور است: فقط کلید مجاز به سرور می‌رود و در URL می‌ماند.
// aria-sort برای صفحه‌خوان وضعیت را می‌گوید؛ ⇅/▲/▼ تزئینی است.
// ============================================================
import React from 'react';
import type { SortDir } from '../lib/useListParams';

interface Props {
  /** کلید مجاز در سرور: serial | date | project */
  sortKey: string;
  label: string;
  sort: string;
  dir: SortDir;
  onToggle: (key: string) => void;
  className?: string;
}

export default function SortTh({ sortKey, label, sort, dir, onToggle, className }: Props) {
  const active = sort === sortKey;
  return (
    <th
      className={className ?? 'text-right px-3 py-3 font-semibold'}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-300"
        title={`مرتب‌سازی بر اساس ${label}`}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}
