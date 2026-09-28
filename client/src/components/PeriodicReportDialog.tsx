// ============================================================
// دیالوگ گزارش دوره‌ای تعویض‌ها (ماهانه/فصلی) — خروجی اکسل سه‌شیتی
// طراح: میثم ایجادی / Meysam Ijadi
// ============================================================
import React, { useState } from 'react';
import Modal from './Modal';
import JalaliDatePicker from './JalaliDatePicker';
import { downloadAuthenticated } from '../lib/download';

export default function PeriodicReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<'monthly' | 'quarterly'>('monthly');
  const [periodStart, setPeriodStart] = useState(''); // ماه شروع: 1404/07
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      const qs = new URLSearchParams({ period });
      if (periodStart.trim()) qs.set('period_start', periodStart.trim());
      if (from.trim()) qs.set('date_from', from.trim());
      if (to.trim()) qs.set('date_to', to.trim());
      await downloadAuthenticated(`/warranty/replacements/periodic-report?${qs.toString()}`, `periodic-${period}-report.xlsx`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="گزارش دوره‌ای تعویض‌ها (اکسل)">
      <div className="space-y-4">
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-5">
          خروجی اکسل سه‌شیتی: <b>خلاصه‌ی دوره</b> (تفکیک پروژه/قطعه/دلیل خرابی) + <b>ریز تعویض‌ها</b> + <b>راهنما</b>.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPeriod('monthly')} className={period === 'monthly' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}>📅 ماهانه</button>
          <button type="button" onClick={() => setPeriod('quarterly')} className={period === 'quarterly' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}>🗓️ فصلی (۳ ماه)</button>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
          <p className="text-[11px] font-bold text-stone-600 dark:text-stone-300">روش ۱ — ماه شروع دوره (بازه خودکار):</p>
          <div className="flex items-center gap-2">
            <input
              className="input !min-h-0 !py-1.5 !text-xs fa-nums"
              dir="ltr"
              placeholder="1404/07"
              value={periodStart}
              onChange={(e) => { setPeriodStart(e.target.value); setFrom(''); setTo(''); }}
            />
            <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">
              {period === 'monthly' ? '۱ ماه از این ماه' : '۳ ماه از این ماه'}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
          <p className="text-[11px] font-bold text-stone-600 dark:text-stone-300">روش ۲ — بازه‌ی صریح (اولویت دارد):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <JalaliDatePicker label="از تاریخ" value={from} onChange={(v: string) => { setFrom(v); setPeriodStart(''); }} placeholder="از تاریخ…" />
            <JalaliDatePicker label="تا تاریخ" value={to} onChange={(v: string) => { setTo(v); setPeriodStart(''); }} placeholder="تا تاریخ…" />
          </div>
        </div>

        <p className="text-[11px] text-stone-400 dark:text-stone-500">
          بدون هیچ ورودی: آخرین دوره‌ی کامل قبل از امروز گزارش می‌شود.
        </p>

        {error && <p className="p-2 bg-coral/10 text-coral-dark rounded-lg text-xs border border-coral/30 dark:text-coral-light">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">انصراف</button>
          <button type="button" onClick={download} disabled={busy} className="btn-primary">
            {busy ? '...' : '⬇ دریافت اکسل گزارش'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
