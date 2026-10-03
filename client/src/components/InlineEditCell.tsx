// ============================================================
// سلول ویرایش درجا — الگوی مشترک فهرست‌ها (فقط ادمین)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • نمایش: متن + آیکن ✏️ با hover (به‌جز حالت busy)
// • کلیک → input با مقدار فعلی؛ Enter/blur = ذخیره، Esc = لغو
// • مقدار بدون تغییر → هیچ درخواستی ارسال نمی‌شود
// • خطا: پیام با alert + ماندن در حالت ویرایش برای اصلاح
// • ذخیره موفق → به‌روزرسانی محلی از طریق onSaved (بدون reload کل فهرست)
// ============================================================
import React, { useEffect, useRef, useState } from 'react';

interface InlineEditCellProps {
  value: string | null | undefined;
  onSave: (newValue: string | null) => Promise<void>; // خطا = throw
  placeholder?: string;
  widthClass?: string;    // عرض input در حالت ویرایش
  numeric?: boolean;      // dir=ltr برای سریال/پارت‌نامبر
  multiline?: boolean;    // textarea برای مشخصات فنی
}

export default function InlineEditCell({
  value,
  onSave,
  placeholder = 'ویرایش…',
  widthClass = 'w-[160px]',
  numeric = false,
  multiline = false,
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      if (multiline) areaRef.current?.focus();
      else inputRef.current?.focus();
    }
  }, [editing, multiline]);

  const start = () => {
    setDraft(value ?? '');
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const commit = async () => {
    const next = draft.trim();
    if (next === (value ?? '').trim()) {
      setEditing(false); // بدون تغییر
      return;
    }
    setBusy(true);
    try {
      await onSave(next === '' ? null : next);
      setEditing(false);
    } catch (err) {
      alert((err as Error).message); // ماندن در حالت ویرایش
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const common = {
      value: draft,
      disabled: busy,
      placeholder,
      onBlur: () => void commit(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
          e.preventDefault();
          void commit();
        } else if (e.key === 'Escape') {
          cancel();
        }
      },
    };
    return multiline ? (
      <textarea
        ref={areaRef}
        rows={2}
        className={`input py-1 px-2 text-xs ${widthClass} resize-y min-h-[2.2rem]`}
        {...common}
        onChange={(e) => setDraft(e.target.value)}
      />
    ) : (
      <input
        ref={inputRef}
        type="text"
        className={`input py-1 px-2 text-sm ${widthClass}`}
        dir={numeric ? 'ltr' : undefined}
        {...common}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="برای ویرایش کلیک کنید"
      className="group flex items-start gap-1.5 max-w-[240px] rounded-lg px-2 py-1 -mx-2 text-right transition hover:bg-brand-50 dark:hover:bg-brand-900/40 cursor-text"
    >
      <span
        className={`truncate ${numeric ? 'fa-nums' : ''} ${value ? 'text-stone-800 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'}`}
        dir={numeric ? 'ltr' : 'auto'}
      >
        {value || '—'}
      </span>
      {!busy && (
        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✏️</span>
      )}
      {busy && (
        <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0 mt-1" />
      )}
    </button>
  );
}
