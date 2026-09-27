// ============================================================
// انتخاب‌گر تاریخ شمسی (Date Picker) با تقویم Popup
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • ورودی متنی با اعتبارسنجی روی blur (فرمت YYYY/MM/DD)
// • دکمه‌ی تقویم → پاپ‌آپ با شبکه‌ی ماهانه‌ی شمسی، ناوبری ماه/سال
// • دکمه‌ی «امروز» برای انتخاب سریع
// • کاملاً RTL و از تم دارک/لات پشتیبانی می‌کند.
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import jalaali from 'jalaali-js';
import {
  normalizeJalali,
  todayJalali,
  toFa,
  JALALI_MONTHS,
} from '../lib/date';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']; // شنبه … جمعه

/** تجزیه‌ی یک رشته‌ی شمسی نرمال‌شده به اجزا */
function parse(jalali: string): { jy: number; jm: number; jd: number } | null {
  const norm = normalizeJalali(jalali);
  if (!norm) return null;
  const [jy, jm, jd] = norm.split('/').map(Number);
  return { jy, jm, jd };
}

export default function JalaliDatePicker({
  label,
  value,
  onChange,
  required,
  className = '',
  placeholder,
}: Props) {
  const [raw, setRaw] = useState(value);
  const [valid, setValid] = useState(true);
  const [open, setOpen] = useState(false);

  // ماهی که تقویم روی آن است (مستقل از مقدار انتخاب‌شده)
  const initial = useMemo(() => parse(value) || parse(todayJalali())!, [value]);
  const [viewYear, setViewYear] = useState(initial.jy);
  const [viewMonth, setViewMonth] = useState(initial.jm);

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRaw(value);
    const p = parse(value);
    if (p) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    }
  }, [value]);

  // بستن پاپ‌آپ با کلیک بیرون
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const blur = () => {
    const norm = normalizeJalali(raw);
    if (raw && !norm) {
      setValid(false);
    } else {
      setValid(true);
      onChange(norm || '');
    }
  };

  const selectDay = (jd: number) => {
    const v = `${viewYear}/${String(viewMonth).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    setRaw(v);
    onChange(v);
    setValid(true);
    setOpen(false);
  };

  const fillToday = () => {
    const t = todayJalali();
    const p = parse(t)!;
    setViewYear(p.jy);
    setViewMonth(p.jm);
    setRaw(t);
    onChange(t);
    setValid(true);
  };

  const prevMonth = () => {
    let m = viewMonth - 1;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };
  const nextMonth = () => {
    let m = viewMonth + 1;
    let y = viewYear;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };
  const prevYear = () => setViewYear((y) => y - 1);
  const nextYear = () => setViewYear((y) => y + 1);

  // ساختن شبکه‌ی روزهای ماه جاری
  const daysGrid = useMemo(() => {
    const monthLen = jalaali.jalaaliMonthLength(viewYear, viewMonth);
    // روز هفته‌ی روز اول ماه (شنبه = 0 در تقویم ما)
    // jalaali-JS خروجی toJalaali نداره برای روز هفته؛ با تبدیل به میلادی و getDay محاسبه می‌کنیم.
    const g = jalaali.toGregorian(viewYear, viewMonth, 1);
    const firstDate = new Date(g.gy, g.gm - 1, g.gd);
    // getDay: یکشنبه=0 ... شنبه=6 → می‌خواهیم شنبه=0 پس (getDay+1)%7
    let firstWeekday = (firstDate.getDay() + 1) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= monthLen; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const selected = parse(value);

  return (
    <div className={className} ref={wrapRef}>
      <label className="label">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <div className="relative flex items-center gap-2">
        <input
          type="text"
          className={`input ${!valid ? 'border-red-500' : ''}`}
          placeholder={placeholder || '1403/05/15'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={blur}
          dir="ltr"
          style={{ textAlign: 'center' }}
          required={required}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn-secondary shrink-0 px-2 py-2"
          title="تقویم"
          aria-label="تقویم"
        >
          📅
        </button>
        <button
          type="button"
          onClick={fillToday}
          className="btn-secondary shrink-0 px-2 py-2 text-xs"
          title="امروز"
        >
          امروز
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-xl top-full right-0 dark:bg-stone-800 dark:border-stone-600">
            {/* هدر ناوبری */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button type="button" onClick={prevYear} className="rounded px-2 py-1 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">«</button>
                <button type="button" onClick={prevMonth} className="rounded px-2 py-1 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">›</button>
              </div>
              <div className="text-sm font-medium text-stone-700 dark:text-stone-200">
                {JALALI_MONTHS[viewMonth - 1]} {toFa(viewYear)}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={nextMonth} className="rounded px-2 py-1 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">‹</button>
                <button type="button" onClick={nextYear} className="rounded px-2 py-1 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">»</button>
              </div>
            </div>

            {/* روزهای هفته */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-400 dark:text-stone-500">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* روزهای ماه */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {daysGrid.map((d, i) => {
                if (d === null) return <div key={i} />;
                const isSelected =
                  selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === d;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectDay(d)}
                    className={`fa-nums rounded-md py-1 text-sm transition ${
                      isSelected
                        ? 'bg-brand-600 text-white font-medium'
                        : 'text-stone-700 hover:bg-brand-50 dark:text-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {toFa(d)}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 border-t border-stone-100 pt-2 dark:border-stone-700">
              <button type="button" onClick={fillToday} className="w-full rounded-md bg-surface-card py-1.5 text-xs text-brand-600 hover:bg-stone-100 dark:bg-stone-700 dark:text-brand-300 dark:hover:bg-stone-600">
                امروز: {toFa(todayJalali())}
              </button>
            </div>
          </div>
        )}
      </div>
      {!valid && <p className="mt-1 text-xs text-red-500">تاریخ نامعتبر است.</p>}
    </div>
  );
}
