// ============================================================
// مولفه‌ی Alert مشترک — زبان طراحی PipelinePro
// variant: danger (قرمز، فقط خطای واقعی) | success (سبز) | warning (نارنجی فوریت)
//          | info (آبی، پیام خنثی/راهنما) | pending (زیتونی، در جریان/نیمه‌تمام)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React from 'react';

export type AlertVariant = 'danger' | 'success' | 'warning' | 'info' | 'pending';

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

// استایل هر variant در index.css — خانواده‌ی form-banner-* (منبع واحد رنگ‌ها)
// بنر ارتقای داشبورد/درباره هم با همین کلاس‌ها رندر می‌شود — بدون آورراید !bg-…
const STYLES: Record<AlertVariant, { cls: string; icon: string; role: string }> = {
  danger: {
    cls: 'form-banner-error',
    icon: '⚠',
    role: 'alert',
  },
  success: {
    cls: 'form-banner-success',
    icon: '✓',
    role: 'status',
  },
  warning: {
    // نارنجی فوریت — هرگز قرمز نیست (قانون PipelinePro)
    cls: 'form-banner-warning',
    icon: '⏳',
    role: 'alert',
  },
  info: {
    // خنثی/راهنما — آبی، بی‌فوریت (role=status تا اسکرین‌ریدر قطع نشود)
    cls: 'form-banner-info',
    icon: 'ℹ️',
    role: 'status',
  },
  pending: {
    // در جریان/نیمه‌تمام — زیتونی ملایم، نه فوری نه خطا
    cls: 'form-banner-pending',
    icon: '🔄',
    role: 'status',
  },
};

export default function Alert({ variant = 'danger', children, className = '' }: AlertProps) {
  const s = STYLES[variant];
  return (
    <div role={s.role} className={`${s.cls} ${className}`}>
      <span aria-hidden className="shrink-0">{s.icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
