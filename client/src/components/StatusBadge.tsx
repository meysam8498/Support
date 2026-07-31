// ============================================================
// نشانگر وضعیت (تجهیز یا قطعه) — طراح: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// وضعیت تجهیز: فعال / معیوب / در حال تعویض / تعویض‌شده
// وضعیت قطعه: active / replaced / defective
// ============================================================
import React from 'react';
import { t } from '../i18n/fa';

type Status = 'active' | 'defective' | 'replacing' | 'replaced';

const map: Record<Status, { cls: string; label: string }> = {
  active:    { cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: t.statusActive },
  defective: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: t.statusDefective },
  replacing: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: t.statusReplacing },
  replaced:  { cls: 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300', label: t.statusReplaced },
};

export default function StatusBadge({ status }: { status: Status }) {
  const s = map[status] || map.active;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
