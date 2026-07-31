// ============================================================
// فهرست تجهیزات
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// دکمه‌های افزودن/ویرایش/حذف فقط برای مدیر نمایش داده می‌شوند.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Device } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';

export default function DevicesPage() {
  const { isAdmin } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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

  const filtered = devices.filter((d) => {
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
    return <p className="text-gray-400 text-center mt-20 dark:text-slate-500">{t.loading}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold dark:text-slate-100">{t.deviceList}</h1>
        {isAdmin && (
          <Link to="/devices/new" className="btn-primary">
            {t.addDevice}
          </Link>
        )}
      </div>

      <input
        className="input max-w-md"
        placeholder={t.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-12 dark:text-slate-500">{t.noData}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="text-right px-3 py-2 font-medium">پروژه</th>
                <th className="text-right px-3 py-2 font-medium">سریال</th>
                <th className="text-right px-3 py-2 font-medium">نوع</th>
                <th className="text-right px-3 py-2 font-medium">برند</th>
                <th className="text-right px-3 py-2 font-medium">{t.status}</th>
                <th className="text-right px-3 py-2 font-medium">تحویل مشتری</th>
                <th className="text-right px-3 py-2 font-medium">پایان گارانتی</th>
                <th className="text-right px-3 py-2 font-medium">قطعات</th>
                <th className="text-right px-3 py-2 font-medium">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  className="border-b hover:bg-gray-50 transition dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <td className="px-3 py-2">
                    <Link to={`/devices/${d.id}`} className="text-brand-600 hover:underline font-medium dark:text-brand-400">
                      {d.project_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 fa-nums" dir="ltr">
                    {d.main_serial || '—'}
                  </td>
                  <td className="px-3 py-2">{d.device_type_name}</td>
                  <td className="px-3 py-2">{d.brand_name || '—'}</td>
                  <td className="px-3 py-2">
                    {d.status && <StatusBadge status={d.status} />}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">
                    {formatJalaliLong(d.customer_delivery_jalali)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">
                    {formatJalaliLong(d.warranty_end_jalali)}
                  </td>
                  <td className="px-3 py-2 text-center fa-nums">{toFa(d.parts_count ?? 0)}</td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <div className="flex gap-1">
                        <Link to={`/devices/${d.id}/edit`} className="text-brand-600 hover:underline text-xs dark:text-brand-400">
                          {t.edit}
                        </Link>
                        <button onClick={() => remove(d.id)} className="text-red-500 hover:underline text-xs mr-2">
                          {t.delete}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
