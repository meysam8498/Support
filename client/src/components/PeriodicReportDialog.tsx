// ============================================================
// دیالوگ گزارش دوره‌ای تعویض‌ها (ماهانه/فصلی) — خروجی اکسل سه‌شیتی
// طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// • بازه: ماه شروع دوره یا بازه‌ی صریح شمسی (یا میان‌برهای سریع)
// • فیلتر اختیاری پروژه و قطعه (عنوان + پارت‌نامبر) — خلاصه فقط برای همان فیلتر
// ============================================================
import React, { useState } from 'react';
import Modal from './Modal';
import JalaliDatePicker from './JalaliDatePicker';
import { downloadAuthenticated } from '../lib/download';
import { api } from '../api/api';
import { jalaliRangePreset } from '../lib/date';

interface Project { id: number; name: string }

export default function PeriodicReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<'monthly' | 'quarterly'>('monthly');
  const [periodStart, setPeriodStart] = useState(''); // ماه شروع: 1404/07
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // فیلتر اختیاری پروژه/قطعه
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [partTitle, setPartTitle] = useState('');
  const [partNumber, setPartNumber] = useState('');

  // فهرست پروژه‌ها برای انتخاب — یک بار هنگام باز شدن
  React.useEffect(() => {
    if (!open) return;
    api.get<{ projects: Project[] }>('/lists')
      .then((l) => setProjects(l.projects ?? []))
      .catch(() => setProjects([]));
  }, [open]);

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      const qs = new URLSearchParams({ period });
      if (periodStart.trim()) qs.set('period_start', periodStart.trim());
      if (from.trim()) qs.set('date_from', from.trim());
      if (to.trim()) qs.set('date_to', to.trim());
      if (projectId) qs.set('project_id', projectId);
      if (partTitle.trim()) qs.set('part_title', partTitle.trim());
      if (partNumber.trim()) qs.set('part_number', partNumber.trim());
      await downloadAuthenticated(`/warranty/replacements/periodic-report?${qs.toString()}`, `periodic-${period}-report.xlsx`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasFilter = Boolean(projectId || partTitle.trim() || partNumber.trim());

  return (
    <Modal open={open} onClose={onClose} title="گزارش دوره‌ای تعویض‌ها (اکسل)">
      <div className="space-y-4">
        <p className="text-xs text-stone-500 dark:text-stone-400 leading-5">
          خروجی اکسل سه‌شیتی: <b>خلاصه‌ی دوره</b> (تفکیک پروژه/قطعه/دلیل خرابی) + <b>ریز تعویض‌ها</b> + <b>راهنما</b>.
          با فیلتر پروژه/قطعه، خلاصه فقط برای همان فیلتر محاسبه می‌شود.
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
            <div className="flex gap-1.5 shrink-0">
              <button type="button" onClick={() => { const r = jalaliRangePreset('this-month'); if (r) { setFrom(r[0]); setTo(r[1]); setPeriodStart(''); } }} className="chip chip-default cursor-pointer !text-[11px]">این ماه</button>
              <button type="button" onClick={() => { const r = jalaliRangePreset('last-month'); if (r) { setFrom(r[0]); setTo(r[1]); setPeriodStart(''); } }} className="chip chip-default cursor-pointer !text-[11px]">ماه قبل</button>
              <button type="button" onClick={() => { const r = jalaliRangePreset('last-3'); if (r) { setFrom(r[0]); setTo(r[1]); setPeriodStart(''); } }} className="chip chip-default cursor-pointer !text-[11px]">۳ ماه اخیر</button>
              <button type="button" onClick={() => { const r = jalaliRangePreset('this-year'); if (r) { setFrom(r[0]); setTo(r[1]); setPeriodStart(''); } }} className="chip chip-default cursor-pointer !text-[11px]">امسال</button>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
          <p className="text-[11px] font-bold text-stone-600 dark:text-stone-300">روش ۲ — بازه‌ی صریح (اولویت دارد):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <JalaliDatePicker label="از تاریخ" value={from} onChange={(v: string) => { setFrom(v); setPeriodStart(''); }} placeholder="از تاریخ…" />
            <JalaliDatePicker label="تا تاریخ" value={to} onChange={(v: string) => { setTo(v); setPeriodStart(''); }} placeholder="تا تاریخ…" />
          </div>
        </div>

        {/* فیلتر اختیاری پروژه/قطعه */}
        <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-stone-600 dark:text-stone-300">فیلتر اختیاری پروژه/قطعه:</p>
            {hasFilter && (
              <button type="button" onClick={() => { setProjectId(''); setPartTitle(''); setPartNumber(''); }} className="text-[11px] text-coral-dark dark:text-coral-light underline cursor-pointer">
                ✕ حذف فیلتر
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select className="input !min-h-0 !py-1.5 !text-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">همه‌ی پروژه‌ها</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              className="input !min-h-0 !py-1.5 !text-xs"
              placeholder="عنوان قطعه (دقیق)…"
              value={partTitle}
              onChange={(e) => setPartTitle(e.target.value)}
              dir="auto"
            />
            <input
              className="input !min-h-0 !py-1.5 !text-xs fa-nums"
              placeholder="پارت‌نامبر (اختیاری)…"
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              dir="ltr"
            />
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
