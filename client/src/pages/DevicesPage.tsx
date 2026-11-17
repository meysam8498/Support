// ============================================================
// فهرست تجهیزات — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// جدول با کارت سفید گرم، هدر استون، ردیف‌های hover گرم، اکشن‌های چایپی
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getPaged, type Device } from '../api/api';
import { useListParams } from '../lib/useListParams';
import SortTh from '../components/SortTh';
import PaginationBar from '../components/PaginationBar';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import { downloadAuthenticated } from '../lib/download';
import Alert from '../components/Alert';

export default function DevicesPage() {
  const { canWrite } = useAuth();
  const {
    page, pageSize: PAGE_SIZE, q, sort, dir, get,
    patch, goPage, toggleSort, searchInput, setSearchInput, queryString,
  } = useListParams();
  const statusFilter = get('status');
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pageError, setPageError] = useState('');

  // شمارش‌های بج فیلتر از سرور می‌آید — فهرست صفحه‌بندی‌شده همه‌ی ردیف‌ها را ندارد
  useEffect(() => {
    api.get<{ total: number; byStatus: Record<string, number> }>('/devices/stats').then(setStats).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getPaged<Device>(`/devices?${queryString({ status: statusFilter })}`);
      setDevices(r.items);
      setTotal(r.total);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, statusFilter, sort, dir]);

  const pickStatus = (value: string) => patch({ status: value || undefined, page: undefined });

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
      setPageError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // اسکلت فقط وقتی هنوز داده‌ای نیست؛ در صفحه‌بندی/فیلتر بعدی، جدول و فیلترها
  // سر جایشان می‌مانند تا فوکوس ورودی جست‌وجو از دست نرود.
  if (loading && devices.length === 0)
    return <p className="text-stone-500 text-center mt-20 dark:text-stone-400">{t.loading}</p>;

  const statusCounts = stats?.byStatus ?? { active: 0, defective: 0, replacing: 0, replaced: 0 };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto px-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🖥️</span>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">{t.deviceList}</h1>
          <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
            {toFa(total)} تجهیز
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

      {pageError && <Alert variant="danger" className="mb-3">{pageError}</Alert>}

      {/* جست‌وجو + چایپ‌های فیلتر وضعیت */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          className="input max-w-md"
          placeholder={t.search}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => pickStatus('')}
            className={statusFilter === '' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            همه <span className="fa-nums">({toFa(total)})</span>
          </button>
          <button
            type="button"
            onClick={() => pickStatus('active')}
            className={statusFilter === 'active' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            فعال <span className="fa-nums">({toFa(statusCounts.active)})</span>
          </button>
          <button
            type="button"
            onClick={() => pickStatus('defective')}
            className={statusFilter === 'defective' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            معیوب <span className="fa-nums">({toFa(statusCounts.defective)})</span>
          </button>
          <button
            type="button"
            onClick={() => pickStatus('replacing')}
            className={statusFilter === 'replacing' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            در حال تعویض <span className="fa-nums">({toFa(statusCounts.replacing)})</span>
          </button>
          <button
            type="button"
            onClick={() => pickStatus('replaced')}
            className={statusFilter === 'replaced' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            تعویض‌شده <span className="fa-nums">({toFa(statusCounts.replaced)})</span>
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <p className="text-stone-500 text-center py-12 dark:text-stone-400">{t.noData}</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-700">
                  <SortTh sortKey="project" label="پروژه" sort={sort} dir={dir} onToggle={toggleSort} />
                  <SortTh sortKey="serial" label="سریال" sort={sort} dir={dir} onToggle={toggleSort} />
                  <th className="text-right px-3 py-3 font-semibold">نوع</th>
                  <th className="text-right px-3 py-3 font-semibold">برند</th>
                  <th className="text-right px-3 py-3 font-semibold">{t.status}</th>
                  <SortTh sortKey="date" label="تحویل مشتری" sort={sort} dir={dir} onToggle={toggleSort} />
                  <th className="text-right px-3 py-3 font-semibold">پایان گارانتی</th>
                  <th className="text-right px-3 py-3 font-semibold">قطعات</th>
                  <th className="text-right px-3 py-3 font-semibold">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
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

      <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPage={goPage} />
    </div>
  );
}
