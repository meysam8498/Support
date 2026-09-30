// ============================================================
// فهرست تعویض‌های گارانتی — با فیلتر دسته‌ی قطعه
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// مقصدِ کلیک روی ردیف‌های «پرخرابی‌ترین قطعات» داشبورد و صفحه‌ی گزارش‌ها.
// ?part=<عنوان>&pn=<پارت‌نامبر>  → فقط تعویض‌های همان دسته‌ی قطعه
// ?project=<id>               → فقط تعویض‌های همان پروژه/مشتری
// بدون query → همه‌ی تعویض‌ها با امکان جست‌وجوی متنی
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import PeriodicReportDialog from '../components/PeriodicReportDialog';
import { useAuth } from '../context/AuthContext';

interface ReplacementRow {
  id: number;
  replaced_at_jalali: string;
  description: string | null;
  device_id: number;
  device_serial: string | null;
  project_name: string | null;
  old_part_id: number | null;
  old_part_title: string | null;
  old_part_serial: string | null;
  new_part_id: number | null;
  new_part_title: string | null;
  new_part_serial: string | null;
  expert_name: string | null;
  failure_reason_name: string | null;
}

export default function ReplacementsListPage() {
  const { canReplace, canRequestWarranty } = useAuth();
  const [params, setParams] = useSearchParams();
  const partTitle = params.get('part') ?? '';
  const partNumber = params.get('pn') ?? '';
  const projectId = params.get('project') ?? '';
  // نام پروژه برای بج فیلتر — از گزارش‌ها با ?project=<id>&name=<نام> می‌آید
  const projectName = params.get('name') ?? '';

  const [rows, setRows] = useState<ReplacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [periodicOpen, setPeriodicOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (partTitle) qs.set('part_title', partTitle);
    if (partNumber) qs.set('part_number', partNumber);
    if (projectId) qs.set('project_id', projectId);
    api
      .get<ReplacementRow[]>(`/warranty/replacements?${qs.toString()}`)
      .then(setRows)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [partTitle, partNumber, projectId]);

  // جست‌وجوی متنی سمت کلاینت روی فیلدهای نمایش‌داده‌شده
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.project_name, r.device_serial, r.old_part_title, r.old_part_serial, r.new_part_title, r.new_part_serial, r.expert_name, r.failure_reason_name, r.replaced_at_jalali]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(needle)),
    );
  }, [rows, q]);

  const hasFilter = Boolean(partTitle || partNumber || projectId);

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      {/* ---------- هدر ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔄</span>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">تعویض‌های گارانتی</h1>
            {hasFilter ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                فیلتر: {partTitle && <b className="text-brand-700 dark:text-brand-300" dir="auto">{partTitle}</b>}
                {projectId && <b className="text-brand-700 dark:text-brand-300" dir="auto">پروژه {projectName || `#${projectId}`}</b>}
                {partNumber && partNumber !== '(بدون پارت‌نامبر)' && (
                  <> · پارت‌نامبر <b className="fa-nums" dir="ltr">{partNumber}</b></>
                )}
              </p>
            ) : (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">همه‌ی تعویض‌های ثبت‌شده</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasFilter && (
            <button
              type="button"
              onClick={() => setParams({}, { replace: true })}
              className="btn-ghost !min-h-[34px] text-xs"
            >
              ✕ حذف فیلتر
            </button>
          )}
          <button
            type="button"
            onClick={() => setPeriodicOpen(true)}
            className="btn-secondary !min-h-[34px] text-xs"
          >
            🗓️ گزارش دوره‌ای
          </button>
          {canReplace && (
            <Link to="/warranty/replace" className="btn-primary !min-h-[34px] text-xs">
              + ثبت تعویض جدید
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="form-banner-error">⚠ <span>{error}</span></div>
      )}

      {/* ---------- نوار جست‌وجوی درون‌صفحه ---------- */}
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">🔍</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جست‌وجو در پروژه، سریال دستگاه/قطعه، کارشناس، دلیل خرابی…"
          className="input !pr-10"
          dir="auto"
        />
      </div>

      {/* ---------- فهرست ---------- */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">{t.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">
            {hasFilter
              ? 'هیچ تعویضی برای این قطعه ثبت نشده است.'
              : q
                ? 'نتیجه‌ای برای جست‌وجوی شما پیدا نشد.'
                : 'هنوز تعویضی ثبت نشده است.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-raised dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                  <th className="text-right px-4 py-3 font-semibold">تاریخ</th>
                  <th className="text-right px-4 py-3 font-semibold">قطعه‌ی قدیم</th>
                  <th className="text-right px-4 py-3 font-semibold">قطعه‌ی جدید</th>
                  <th className="text-right px-4 py-3 font-semibold">دستگاه</th>
                  <th className="text-right px-4 py-3 font-semibold">پروژه</th>
                  <th className="text-right px-4 py-3 font-semibold">دلیل خرابی</th>
                  <th className="text-right px-4 py-3 font-semibold">کارشناس</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-dashed border-stone-200 dark:border-stone-700 hover:bg-brand-50/60 dark:hover:bg-brand-900/25 transition-colors"
                  >
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap fa-nums">
                      {formatJalaliLong(r.replaced_at_jalali)}
                    </td>
                    <td className="px-4 py-3">
                      {r.old_part_id ? (
                        <Link to={`/parts/${r.old_part_id}`} className="font-semibold text-stone-800 dark:text-stone-100 hover:text-brand-700 dark:hover:text-brand-300" dir="auto">
                          {r.old_part_title || '—'}
                        </Link>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                      {r.old_part_serial && (
                        <span className="block text-[11px] text-stone-400 dark:text-stone-500 fa-nums" dir="ltr">{r.old_part_serial}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.new_part_id ? (
                        <Link to={`/parts/${r.new_part_id}`} className="font-semibold text-stone-800 dark:text-stone-100 hover:text-brand-700 dark:hover:text-brand-300" dir="auto">
                          {r.new_part_title || '—'}
                        </Link>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                      {r.new_part_serial && (
                        <span className="block text-[11px] text-stone-400 dark:text-stone-500 fa-nums" dir="ltr">{r.new_part_serial}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/devices/${r.device_id}`} className="text-stone-700 dark:text-stone-200 hover:text-brand-700 dark:hover:text-brand-300 fa-nums" dir="ltr">
                        {r.device_serial || '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300" dir="auto">{r.project_name || '—'}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300" dir="auto">{r.failure_reason_name || '—'}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300" dir="auto">{r.expert_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-400 dark:text-stone-500 text-center fa-nums">
        {toFa(filtered.length)} تعویض{hasFilter ? ' برای این قطعه' : ''}
      </p>

      <PeriodicReportDialog open={periodicOpen} onClose={() => setPeriodicOpen(false)} />
    </div>
  );
}
