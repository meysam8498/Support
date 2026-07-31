// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';

interface FailedPart { part_title: string; part_number_1?: string; replacement_count: number; affected_devices: number; }
interface FailureByCustomer { project_id: number; project_name: string; claims_count: number; affected_devices: number; distinct_failures: number; }
interface FailureByReason { failure_reason_id: number; failure_reason_name: string; replacement_count: number; affected_devices: number; affected_customers: number; }
interface ServiceNeed { device_type_id: number; device_type_name: string; total_devices: number; total_parts: number; total_replacements: number; replacements_per_device: number; }

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-slate-200">{label}</span>
        <span className="font-medium fa-nums text-gray-500 dark:text-slate-400">{toFa(value)}</span>
      </div>
      <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [failed, setFailed] = useState<FailedPart[]>([]);
  const [byCust, setByCust] = useState<FailureByCustomer[]>([]);
  const [byReason, setByReason] = useState<FailureByReason[]>([]);
  const [service, setService] = useState<ServiceNeed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [f, c, r, s] = await Promise.all([
          api.get<FailedPart[]>('/reports/most-failed-parts'),
          api.get<FailureByCustomer[]>('/reports/failures-by-customer'),
          api.get<FailureByReason[]>('/reports/failures-by-reason'),
          api.get<ServiceNeed[]>('/reports/service-needs-by-type'),
        ]);
        setFailed(f); setByCust(c); setByReason(r); setService(s);
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.loading}</p>;

  const maxFailed = Math.max(1, ...failed.map((x) => x.replacement_count));
  const maxCust = Math.max(1, ...byCust.map((x) => x.claims_count));
  const maxReason = Math.max(1, ...byReason.map((x) => x.replacement_count));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold dark:text-slate-100">{t.navReports}</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* پرخرابی‌ترین قطعات */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-slate-100">{t.mostFailed}</h2>
          {failed.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p> : (
            failed.map((f) => (
              <BarRow key={f.part_title + (f.part_number_1 || '')} label={`${f.part_title}${f.part_number_1 ? ` (${f.part_number_1})` : ''}`} value={f.replacement_count} max={maxFailed} color="bg-red-500" />
            ))
          )}
        </div>

        {/* خرابی بر اساس مشتری */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-slate-100">{t.failuresByCustomer}</h2>
          {byCust.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p> : (
            byCust.map((c) => (
              <BarRow key={c.project_id} label={c.project_name} value={c.claims_count} max={maxCust} color="bg-amber-500" />
            ))
          )}
        </div>

        {/* خرابی بر اساس دلیل */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-slate-100">{t.failuresByReason}</h2>
          {byReason.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p> : (
            byReason.map((r) => (
              <BarRow key={r.failure_reason_id} label={r.failure_reason_name} value={r.replacement_count} max={maxReason} color="bg-purple-500" />
            ))
          )}
        </div>

        {/* نیاز خدمات به تفکیک نوع دستگاه */}
        <div className="card">
          <h2 className="text-base font-semibold mb-3 dark:text-slate-100">{t.serviceNeeds}</h2>
          {service.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                  <th className="text-right px-3 py-2 font-medium">نوع</th>
                  <th className="text-center px-3 py-2 font-medium">دستگاه</th>
                  <th className="text-center px-3 py-2 font-medium">قطعه</th>
                  <th className="text-center px-3 py-2 font-medium">تعویض</th>
                  <th className="text-center px-3 py-2 font-medium">نسبت</th>
                </tr></thead>
                <tbody>
                  {service.map((s) => (
                    <tr key={s.device_type_id} className="border-b dark:border-slate-700">
                      <td className="px-3 py-2 font-medium dark:text-slate-200">{s.device_type_name}</td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-slate-300">{toFa(s.total_devices)}</td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-slate-300">{toFa(s.total_parts)}</td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-slate-300">{toFa(s.total_replacements)}</td>
                      <td className="px-3 py-2 text-center fa-nums">
                        <span className={`badge ${s.replacements_per_device >= 1 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>{toFa(s.replacements_per_device)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
