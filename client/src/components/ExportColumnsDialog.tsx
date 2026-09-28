// ============================================================
// دیالوگ خروجی اکسل تعویض‌ها — انتخاب ستون‌ها و فرمت
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • چک‌باکس برای هر ستون (ترتیب خروجی = ترتیب تعریف SERVER_COLUMNS)
// • «همه» / «هیچ‌کدام» + حداقل یک ستون برای فعال‌شدن دکمه‌ی دانلود
// • فرمت: اکسل (xlsx) یا CSV (با BOM فارسی)
// • query فعلی صفحه (فیلترها) حفظ و به درخواست اضافه می‌شود
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';

/** ترتیب و برچسب ستون‌ها — کلیدها همان whitelist سرور هستند */
const COLUMNS: { key: string; label: string; group: string }[] = [
  { key: 'date', label: 'تاریخ تعویض', group: 'زمان' },
  { key: 'project', label: 'پروژه', group: 'مکان' },
  { key: 'device_serial', label: 'سریال دستگاه', group: 'مکان' },
  { key: 'old_title', label: 'قطعه‌ی قدیم', group: 'قطعه‌ی قدیم' },
  { key: 'old_pn', label: 'پارت‌نامبر قدیم', group: 'قطعه‌ی قدیم' },
  { key: 'old_serial', label: 'سریال قدیم', group: 'قطعه‌ی قدیم' },
  { key: 'new_title', label: 'قطعه‌ی جدید', group: 'قطعه‌ی جدید' },
  { key: 'new_pn', label: 'پارت‌نامبر جدید', group: 'قطعه‌ی جدید' },
  { key: 'new_serial', label: 'سریال جدید', group: 'قطعه‌ی جدید' },
  { key: 'failure_reason', label: 'دلیل خرابی', group: 'سایر' },
  { key: 'expert', label: 'کارشناس', group: 'سایر' },
  { key: 'description', label: 'توضیحات', group: 'سایر' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** پارامترهای فیلتر جاری صفحه (مثل part_title / project_id) — بدون columns/format */
  baseQuery?: Record<string, string>;
}

export default function ExportColumnsDialog({ open, onClose, baseQuery = {} }: Props) {
  // پیش‌فرض: همه‌ی ستون‌ها انتخاب‌اند
  const [selected, setSelected] = useState<Set<string>>(() => new Set(COLUMNS.map((c) => c.key)));
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // هر بار باز شدن، انتخاب‌ها به پیش‌فرض برگردد
  useEffect(() => {
    if (open) {
      setSelected(new Set(COLUMNS.map((c) => c.key)));
      setFormat('xlsx');
      setError('');
    }
  }, [open]);

  const toggle = (key: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const selectAll = () => setSelected(new Set(COLUMNS.map((c) => c.key)));
  const selectNone = () => setSelected(new Set());

  const groups = useMemo(() => {
    const g = new Map<string, typeof COLUMNS>();
    for (const c of COLUMNS) {
      if (!g.has(c.group)) g.set(c.group, []);
      g.get(c.group)!.push(c);
    }
    return [...g.entries()];
  }, []);

  const download = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError('');
    try {
      const qs = new URLSearchParams(baseQuery);
      qs.set('columns', [...selected].join(','));
      qs.set('format', format);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/warranty/replacements/export?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `خطای ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `replacements-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="خروجی اکسل تعویض‌ها">
      <div className="space-y-4">
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-5">
          ستون‌های دلخواه را انتخاب کنید — ترتیب ستون‌ها همان ترتیب زیر است. فیلترهای فعلی صفحه هم روی خروجی اعمال می‌شوند.
        </p>

        {/* انتخاب/لغو انتخاب همه + شمارنده */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-600 dark:text-stone-300 fa-nums">
            {toFa(selected.size)} از {toFa(COLUMNS.length)} ستون
          </span>
          <div className="flex gap-1.5">
            <button type="button" onClick={selectAll} className="btn-ghost !min-h-[28px] !px-2.5 text-[11px]">همه</button>
            <button type="button" onClick={selectNone} className="btn-ghost !min-h-[28px] !px-2.5 text-[11px]">هیچ‌کدام</button>
          </div>
        </div>

        {/* گروه‌بندی ستون‌ها */}
        <div className="space-y-2.5 max-h-64 overflow-y-auto pl-1">
          {groups.map(([group, cols]) => (
            <div key={group}>
              <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mb-1">{group}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {cols.map((c) => (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors ${
                      selected.has(c.key)
                        ? 'bg-brand-50/80 border-brand-300 dark:bg-brand-900/30 dark:border-brand-700 text-brand-800 dark:text-brand-200'
                        : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-surface-raised dark:hover:bg-stone-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.key)}
                      onChange={() => toggle(c.key)}
                      className="w-3.5 h-3.5 accent-brand-500 shrink-0"
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* فرمت خروجی */}
        <div>
          <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 mb-1">فرمت فایل</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={format === 'xlsx' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}
            >
              📊 اکسل (xlsx)
            </button>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={format === 'csv' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}
              title="مناسب برای اکسل فارسی/Google Sheets — با پشتیبانی UTF-8"
            >
              📄 CSV
            </button>
          </div>
        </div>

        {error && (
          <p className="p-2 bg-coral/10 text-coral-dark rounded-lg text-xs border border-coral/30 dark:text-coral-light">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">{t.cancel}</button>
          <button onClick={download} disabled={busy || selected.size === 0} className="btn-primary">
            {busy ? '...' : `⬇ دانلود (${toFa(selected.size)} ستون)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
