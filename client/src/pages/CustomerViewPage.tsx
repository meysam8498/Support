// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Device, type Part, type Replacement } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import StatusBadge from '../components/StatusBadge';

interface Data {
  project: { id: number; name: string; contract_number?: string; sales_expert_name?: string };
  devices: Device[];
  parts: Part[];
  services: Replacement[];
}

export default function CustomerViewPage() {
  const { id } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setData(await api.get(`/dashboard/by-customer?project_id=${id}`)); }
      catch { /* */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.loading}</p>;
  if (!data) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.noData}</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-brand-600 dark:text-brand-400 text-sm hover:underline">→ بازگشت به داشبورد</Link>
        <h1 className="text-xl font-bold mt-1 dark:text-slate-100">نمای مشتری: {data.project.name}</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          قرارداد: <span className="fa-nums" dir="ltr">{data.project.contract_number || '—'}</span>
          {' | '}کارشناس فروش: {data.project.sales_expert_name || '—'}
        </p>
      </div>

      {/* خلاصه */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center"><div className="text-2xl font-bold text-blue-600 dark:text-blue-400 fa-nums">{toFa(data.devices.length)}</div><div className="text-xs text-gray-500 dark:text-slate-400">دستگاه</div></div>
        <div className="card text-center"><div className="text-2xl font-bold text-purple-600 dark:text-purple-400 fa-nums">{toFa(data.parts.length)}</div><div className="text-xs text-gray-500 dark:text-slate-400">قطعه</div></div>
        <div className="card text-center"><div className="text-2xl font-bold text-amber-600 dark:text-amber-400 fa-nums">{toFa(data.services.length)}</div><div className="text-xs text-gray-500 dark:text-slate-400">تعویض گارنتی</div></div>
      </div>

      {/* دستگاه‌ها */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-slate-100">دستگاه‌ها</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {data.devices.map((d) => (
            <Link key={d.id} to={`/devices/${d.id}`} className="border dark:border-slate-700 rounded-lg p-3 hover:border-brand-300 hover:bg-brand-50/30 dark:hover:bg-slate-700/40 transition text-sm">
              <div className="flex justify-between">
                <span className="font-medium dark:text-slate-200">{d.device_type_name}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{d.brand_name}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                سریال: <span className="fa-nums" dir="ltr">{d.main_serial || '—'}</span>
                {' | '}قطعات: <b className="fa-nums">{toFa(d.parts_count ?? 0)}</b>
                {' | '}تعویض: <b className="fa-nums">{toFa(d.replacements_count ?? 0)}</b>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* سابقه خدمات */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-slate-100">سابقه خدمات و گارنتی</h2>
        {data.services.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p> : (
          <div className="space-y-2">
            {data.services.map((s) => (
              <div key={s.id} className="border-r-4 border-amber-400 bg-amber-50/40 dark:bg-amber-900/20 rounded p-3 text-sm">
                <div className="flex justify-between">
                  <span className="dark:text-slate-200"><b className="text-red-600 dark:text-red-400">{s.old_part_title}</b> ← <b className="text-green-600 dark:text-green-400">{s.new_part_title}</b></span>
                  <span className="text-xs text-gray-400 dark:text-slate-500 fa-nums">{formatJalaliLong(s.replaced_at_jalali)}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">دلیل: {s.failure_reason_name || '—'} | کارشناس: {s.expert_name || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
