// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Part, type Replacement } from '../api/api';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

interface TracePart { id: number; title: string; part_serial_number?: string; status: string; sold_at_jalali?: string; replaces_part_id?: number; }

export default function PartDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<{ part: Part & { device_serial?: string; device_id?: number; device_type_name?: string; brand_name?: string; project_name?: string }; chain: TracePart[]; replacements: Replacement[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setData(await api.get(`/parts/${id}`)); }
      catch { /* */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.loading}</p>;
  if (!data) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.noData}</p>;

  const { part: p } = data;

  const rows: [string, string | undefined][] = [
    [t.partTitle, p.title],
    [t.techSpecs, p.tech_specs],
    [t.partNumber1, p.part_number_1],
    [t.partNumber2, p.part_number_2],
    [t.partSerial, p.part_serial_number],
    ['پروژه', p.project_name],
    ['دستگاه', p.device_serial],
    [t.soldDate, formatJalaliLong(p.sold_at_jalali)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold dark:text-stone-50">جزئیات قطعه</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Link to={`/parts/${p.id}/edit`} className="btn-secondary">{t.edit}</Link>
            {p.status === 'active' && p.device_id && (
              <Link to={`/warranty/replace?part=${p.id}&device=${p.device_id}`} className="btn-primary">{t.replacePart}</Link>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-stone-400 dark:text-stone-500 text-xs">{k}</span>
              <span className="font-medium fa-nums dark:text-stone-200" dir={k.includes('پارت') || k.includes('سریال') ? 'ltr' : 'rtl'}>{v || '—'}</span>
            </div>
          ))}
          <div className="flex flex-col">
            <span className="text-stone-400 dark:text-stone-500 text-xs">{t.status}</span>
            <span><StatusBadge status={p.status} /></span>
          </div>
        </div>
      </div>

      {/* مسیر کامل قطعه (timeline) */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-50">مسیر کامل قطعه (از فروش تا تعویض)</h2>
        {data.chain.length <= 1 && data.replacements.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">این قطعه هنوز تعویض نشده است.</p>
        ) : (
          <div className="relative pr-4">
            <div className="absolute right-[7px] top-2 bottom-2 w-0.5 bg-stone-200 dark:bg-stone-600" />
            {data.chain.map((c, i) => (
              <div key={c.id} className="relative pb-5 pr-6">
                <div className={`absolute right-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-stone-800 ${i === 0 ? 'bg-brand-600' : c.status === 'replaced' ? 'bg-amber-400' : 'bg-green-500'}`} />
                <div className="text-sm dark:text-stone-200">
                  <span className="font-medium">{c.title}</span>
                  {c.part_serial_number && <span className="text-stone-400 dark:text-stone-500 text-xs mr-2 fa-nums" dir="ltr">({c.part_serial_number})</span>}
                  <span className="mx-2"><StatusBadge status={c.status as 'active' | 'replaced' | 'defective'} /></span>
                  <span className="text-xs text-stone-400 dark:text-stone-500 fa-nums">{formatJalaliLong(c.sold_at_jalali)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* تعویض‌ها — با لینک به فهرست فیلترشده‌ی تعویض‌های همان دسته */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-base font-semibold dark:text-stone-50">سوابق تعویض ({toFa(data.replacements.length)})</h2>
          {data.replacements.length > 0 && (
            <Link
              to={`/warranty?part=${encodeURIComponent(data.replacements[0].old_part_title || p.title)}${p.part_number_1 ? `&pn=${encodeURIComponent(p.part_number_1)}` : ''}`}
              className="text-xs text-brand-600 dark:text-brand-300 hover:underline"
            >
              مشاهده در فهرست تعویض‌ها →
            </Link>
          )}
        </div>
        {data.replacements.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">این قطعه هنوز تعویض نشده است.</p>
        ) : (
          <div className="space-y-3">
            {data.replacements.map((r) => (
              <div key={r.id} className="border dark:border-stone-700 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-medium text-red-600 dark:text-red-400">{r.old_part_title}</span>
                    <span className="mx-2 text-stone-400 dark:text-stone-500">→</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{r.new_part_title}</span>
                  </div>
                  <span className="text-xs text-stone-400 dark:text-stone-500 fa-nums">{formatJalaliLong(r.replaced_at_jalali)}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <span>کارشناس: {r.expert_name || '—'}</span>
                  <span>دلیل: {r.failure_reason_name || '—'}</span>
                  <span className="fa-nums" dir="ltr">سریال جدید: {r.new_part_serial || '—'}</span>
                </div>
                {r.description && <p className="mt-2 text-xs text-stone-600 dark:text-stone-300 bg-surface-card dark:bg-stone-700/50 p-2 rounded">{r.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
