// ============================================================
// Autocomplete کاتالوگ قطعات — کمترین ورودی، همه‌چیز از لیست
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// با تایپ پارت‌نامبر (یا عنوان)، مراجع کاتالوگ پیشنهاد می‌شوند؛ انتخاب یک
// پیشنهاد، title و tech_specs را خودکار پر می‌کند. اگر هیچ مرجعی نبود،
// اختیاری «ساخت مرجع جدید از همین ورودی» را می‌دهد (فقط ادمین).
// debounce 250ms + abort درخواست‌های قدیمی — سبک برای چند کاربر همزمان.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface CatalogEntry {
  id: number;
  part_number_1: string;
  part_number_2: string | null;
  title: string;
  tech_specs: string | null;
  installed_count?: number;
}

export interface AutoFillValues {
  title: string;
  tech_specs: string;
  part_number_1?: string;
  part_number_2?: string | null;
}

interface Props {
  /** مقدار فعلی پارت‌نامبر — منبع جست‌وجو */
  value: string;
  /** فراخوانی وقتی کاربر مرجعی را انتخاب کرد */
  onPick: (v: AutoFillValues) => void;
  placeholder?: string;
  className?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  /** onChange برای کنترل مقدار توسط والد (کنترل‌شده) */
  onChange?: (v: string) => void;
  /** پاس‌دادن رویدادهای گرید اکسل‌مانند */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  cellAttr?: Record<string, string>;
}

export default function CatalogAutocomplete({
  value,
  onPick,
  placeholder,
  className = 'input',
  dir = 'ltr',
  onChange,
  onKeyDown,
  onPaste,
  cellAttr,
}: Props) {
  const { isAdmin } = useAuth();
  const [hits, setHits] = useState<CatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // آخرین مقداری که از کاتالوگ پر شد — تا انتخاب بعدی مجدد کار کند
  const lastPickedRef = useRef<string>('');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const term = value.trim();
    // اگر دقیقاً همان چیزی است که از کاتالوگ انتخاب شده، دوباره جست‌وجو نکن
    if (term === lastPickedRef.current || term.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/part-catalog?q=${encodeURIComponent(term)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: ctrl.signal,
        });
        const json = (await res.json()) as CatalogEntry[];
        setHits((json || []).slice(0, 6));
        setOpen((json || []).length > 0);
        setActiveIdx(-1);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') { setHits([]); setOpen(false); }
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const pick = (h: CatalogEntry) => {
    lastPickedRef.current = value.trim();
    setOpen(false);
    setHits([]);
    onPick({ title: h.title, tech_specs: h.tech_specs || '', part_number_1: h.part_number_1, part_number_2: h.part_number_2 });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(hits[activeIdx]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        dir={dir}
        autoComplete="off"
        data-grid-cell={cellAttr ? '' : undefined}
        {...cellAttr}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => { onKey(e); onKeyDown?.(e); }}
        onPaste={onPaste}
        onFocus={() => { if (hits.length) setOpen(true); }}
      />
      {busy && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      )}
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-surface-card dark:bg-stone-800 shadow-lg max-h-[240px] overflow-y-auto">
          {hits.map((h, i) => (
            <button
              key={h.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full text-right px-3 py-2 border-b border-dashed border-stone-100 dark:border-stone-700 last:border-0 transition-colors ${
                i === activeIdx ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-surface-raised dark:hover:bg-stone-700/60'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate" dir="auto">{h.title}</span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400 fa-nums" dir="ltr">
                    {h.part_number_1}
                    {h.part_number_2 && <span className="text-brand-600 dark:text-brand-300"> · PN2: {h.part_number_2}</span>}
                    {h.tech_specs ? ` · ${h.tech_specs}` : ''}
                  </span>
                </span>
                {typeof h.installed_count === 'number' && h.installed_count > 0 && (
                  <span className="chip chip-default px-1.5 py-0 text-[10px] shrink-0 fa-nums">{h.installed_count} نصب</span>
                )}
              </span>
            </button>
          ))}
          {isAdmin && (
            <p className="px-3 py-1.5 text-[10px] text-stone-400 dark:text-stone-500 border-t border-dashed border-stone-100 dark:border-stone-700">
              ↑↓ انتخاب · Enter تأیید — انتخاب، عنوان و مشخصات را خودکار پر می‌کند
            </p>
          )}
        </div>
      )}
    </div>
  );
}
