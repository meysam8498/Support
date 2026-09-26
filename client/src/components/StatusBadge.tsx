// ============================================================
// نشانگر وضعیت (تجهیز یا قطعه) — سیستم طراحی Flip7
// طراح: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// وضعیت تجهیز: فعال / معیوب / در حال تعویض / تعویض‌شده
// وضعیت قطعه: active / replaced / defective
// رنگ‌ها: فعال=تیل، معیوب=مرجانی، در حال تعویض=طلایی، تعویض‌شده=خنثی
// ============================================================
import React from 'react';
import { t } from '../i18n/fa';

type Status = 'active' | 'defective' | 'replacing' | 'replaced';

const map: Record<Status, { cls: string; label: string }> = {
  active: {
    cls: 'bg-brand-50 text-brand-700 border border-brand-300 dark:bg-brand-900/50 dark:text-brand-200 dark:border-brand-700',
    label: t.statusActive,
  },
  defective: {
    cls: 'bg-coral/10 text-coral-dark border border-coral/40 dark:bg-coral/20 dark:text-coral-light',
    label: t.statusDefective,
  },
  replacing: {
    cls: 'bg-gold/15 text-[#8a6d00] border border-gold/50 dark:bg-gold/20 dark:text-gold-light',
    label: t.statusReplacing,
  },
  replaced: {
    cls: 'bg-sky/10 text-sky-dark border border-sky/40 dark:bg-sky/15 dark:text-sky-light',
    label: t.statusReplaced,
  },
};

export default function StatusBadge({ status }: { status: Status }) {
  const s = map[status] || map.active;
  return (
    <span className={`badge ${s.cls}`}>
      {/* نقطه‌ی رنگی وضعیت مثل نشان‌های بازی */}
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current ml-1.5" />
      {s.label}
    </span>
  );
}
