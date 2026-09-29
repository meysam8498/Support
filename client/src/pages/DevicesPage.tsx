// ============================================================
// فهرست تجهیزات — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// جدول با کارت سفید گرم، هدر استون، ردیف‌های hover گرم، اکشن‌های چایپی
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Device } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import { downloadAuthenticated } from '../lib/download';

export default function DevicesPage() {
  const { canWrite } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    try {
      const d = await api.get<Device[]>('/devices');
      setDevices(d);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: number) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/devices/${id}`);
      load();
    } catch {
      /* */
    }
  };

  /** خروجی اکسل تجهیزات و قطعاتشان در قالب فهرست انبار */
  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadAuthenticated('/devices/export/warehouse', 'devices-warehouse.xlsx');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const filtered = devices.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (d.project_name || '').toLowerCase().includes(q) ||
      (d.main_serial || '').toLowerCase().includes(q) ||
      (d.part_number_1 || '').toLowerCase().includes(q) ||
      (d.device_type_name || '').toLowerCase().includes(q) ||
      (d.brand_name || '').toLowerCase().includes(q) ||
      (d.contract_number || '').toLowerCase().includes(q)
    );
  });

  if (loading)
    return <p className="text-stone-400 text-center mt-20 dark:text-stone-500">{t.loading}</p>;

  const statusCounts = {
    active: devices.filter((d) => d.status === 'active').length,
    defective: devices.filter((d) => d.status === 'defective').length,
    replacing: devices.filter((d) => d.status === 'replacing').length,
    replaced: devices.filter((d) => d.status === 'replaced').length,
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto px-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🖥️</span>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">{t.deviceList}</h1>
          <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
            {toFa(devices.length)} تجهیز
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportExcel}
            disabled={exporting || devices.length === 0}
            title="خروجی اکسل تجهیزات + قطعات هر دستگاه — قابل بازخورد به ورود سریال"
          >
            {exporting ? '...' : '⬇ خروجی اکسل'}
          </button>
          {canWrite && (
            <Link to="/devices/new" className="btn-primary">
              {t.addDevice}
            </Link>
          )}
        </div>
      </div>

      {/* جست‌وجو + چایپ‌های فیلتر وضعیت */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          className="input max-w-md"
          placeholder={t.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={statusFilter === '' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            همه <span className="fa-nums opacity-70">({toFa(devices.length)})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={statusFilter === 'active' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            فعال <span className="fa-nums opacity-70">({toFa(statusCounts.active)})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('defective')}
            className={statusFilter === 'defective' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            معیوب <span className="fa-nums opacity-70">({toFa(statusCounts.defective)})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('replacing')}
            className={statusFilter === 'replacing' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            در حال تعویض <span className="fa-nums opacity-70">({toFa(statusCounts.replacing)})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('replaced')}
            className={statusFilter === 'replaced' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            تعویض‌شده <span className="fa-nums opacity-70">({toFa(statusCounts.replaced)})</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-400 text-center py-12 dark:text-stone-500">{t.noData}</p>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-700">
                  <th className="text-right px-3 py-3 font-semibold">پروژه</th>
                  <th className="text-right px-3 py-3 font-semibold">سریال</th>
                  <th className="text-right px-3 py-3 font-semibold">نوع</th>
                  <th className="text-right px-3 py-3 font-semibold">برند</th>
                  <th className="text-right px-3 py-3 font-semibold">{t.status}</th>
                  <th className="text-right px-3 py-3 font-semibold">تحویل مشتری</th>
                  <th className="text-right px-3 py-3 font-semibold">پایان گارانتی</th>
                  <th className="text-right px-3 py-3 font-semibold">قطعات</th>
                  <th className="text-right px-3 py-3 font-semibold">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-dashed border-stone-100 dark:border-stone-700 hover:bg-brand-50/60 dark:hover:bg-brand-900/25 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/devices/${d.id}`}
                        className="text-brand-600 dark:text-brand-300 hover:underline font-semibold"
                      >
                        {d.project_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 fa-nums text-stone-700 dark:text-stone-200" dir="ltr">
                      {d.main_serial || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-stone-700 dark:text-stone-200">{d.device_type_name}</td>
                    <td className="px-3 py-2.5 text-stone-600 dark:text-stone-300">{d.brand_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      {d.status && <StatusBadge status={d.status} />}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {formatJalaliLong(d.customer_delivery_jalali)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {formatJalaliLong(d.warranty_end_jalali)}
                    </td>
                    <td className="px-3 py-2.5 text-center fa-nums">
                      <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                        {toFa(d.parts_count ?? 0)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {canWrite ? (
                        <div className="flex gap-2 items-center">
                          <Link
                            to={`/devices/${d.id}/edit`}
                            className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:underline"
                          >
                            {t.edit}
                          </Link>
                          <span className="text-stone-200 dark:text-stone-600">·</span>
                          <button
                            onClick={() => remove(d.id)}
                            className="text-xs font-semibold text-coral hover:text-coral-dark dark:text-coral-light"
                          >
                            {t.delete}
                          </button>
                        </div>
                      ) : (
                        <span className="text-stone-300 text-xs dark:text-stone-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
