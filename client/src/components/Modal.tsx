// ============================================================
// کامپوننت مودال — طراح: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// پشتیبانی از تم دارک + بستن با کلید Escape و کلیک بیرون.
// دسترس‌پذیری (۱.۳۱): role=dialog/aria-modal + عنوان مرتبط، فوکوس اولیه داخل
// پنل، تله‌ی فوکوس Tab/Shift+Tab و بازگرداندن فوکوس به عامل بازکننده هنگام بستن.
// ============================================================
import React, { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

/** المان‌های قابل‌فوکوس داخل پنل — ترتیب DOM = ترتیب Tab */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, wide }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // عاملی که دیالوگ را باز کرد — فوکوس بعد از بستن برمی‌گردد (الگوی WAI-ARIA)
  const openerRef = useRef<HTMLElement | null>(null);

  // بستن با کلید Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // فوکوس اولیه داخل پنل + بازگرداندن فوکوس هنگام بسته‌شدن/unmount
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => { openerRef.current?.focus(); };
  }, [open]);

  // تله‌ی فوکوس: Tab و Shift+Tab داخل پنل حلقه می‌زنند
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active ? panelRef.current.contains(active) : false;
    if (e.shiftKey) {
      if (!inside || active === first) { e.preventDefault(); last.focus(); }
    } else if (!inside || active === last) {
      e.preventDefault(); first.focus();
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`bg-white rounded-2xl shadow-xl mx-4 dark:bg-stone-800 ${
          wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'
        } max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-stone-700">
          <h2 id={titleId} className="text-lg font-semibold dark:text-stone-50">{title}</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none dark:hover:text-stone-200"
            aria-label="بستن"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto p-6 dark:text-stone-200">{children}</div>
      </div>
    </div>
  );
}
