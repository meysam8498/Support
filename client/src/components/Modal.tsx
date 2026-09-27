// ============================================================
// کامپوننت مودال — طراح: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// پشتیبانی از تم دارک + بستن با کلید Escape و کلیک بیرون.
// ============================================================
import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide }: Props) {
  // بستن با کلید Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl mx-4 dark:bg-stone-800 ${
          wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'
        } max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-stone-700">
          <h2 className="text-lg font-semibold dark:text-stone-50">{title}</h2>
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
