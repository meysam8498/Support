// ============================================================
// مولفه‌ی Alert مشترک — زبان طراحی PipelinePro
// variant: danger (قرمز، فقط خطای واقعی) | success (سبز) | warning (نارنجی فوریت)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React from 'react';

export type AlertVariant = 'danger' | 'success' | 'warning';

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

const STYLES: Record<AlertVariant, { cls: string; icon: string; role: string }> = {
  danger: {
    cls: 'border-red-200 bg-red-50 text-error dark:border-red-900/60 dark:bg-red-900/20 dark:text-coral-light',
    icon: '⚠',
    role: 'alert',
  },
  success: {
    cls: 'border-green-200 bg-success/10 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: '✓',
    role: 'status',
  },
  warning: {
    // نارنجی فوریت — هرگز قرمز نیست (قانون PipelinePro)
    cls: 'border-gold/40 bg-gold/10 text-gold-dark dark:text-gold-light',
    icon: '⏳',
    role: 'alert',
  },
};

export default function Alert({ variant = 'danger', children, className = '' }: AlertProps) {
  const s = STYLES[variant];
  return (
    <div role={s.role} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${s.cls} ${className}`}>
      <span aria-hidden className="shrink-0">{s.icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
