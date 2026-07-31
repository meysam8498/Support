// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Part } from '../api/api';
import { t } from '../i18n/fa';
import { formatJalaliLong } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export default function PartsPage() {
  const { isAdmin } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setParts(await api.get<Part[]>('/parts')); }
      catch { /* */ }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = parts.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.part_number_1 || '').toLowerCase().includes(q) ||
      (p.part_serial_number || '').toLowerCase().includes(q) ||
      (p.project_name || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.loading}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-xl font-bold dark:text-slate-100">فهرست قطعات</h1>
        {isAdmin && <Link to="/parts/new" className="btn-primary text-sm">{t.addPart}</Link>}
      </div>

      <div className="flex gap-3 flex-wrap">
        <input className="input max-w-md" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">همه‌ی وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="replaced">تعویض‌شده</option>
          <option value="defective">معیوب</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 dark:text-slate-500 text-center py-12">{t.noData}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
              <th className="text-right px-3 py-2 font-medium">{t.partTitle}</th>
              <th className="text-right px-3 py-2 font-medium">{t.partNumber1}</th>
              <th className="text-right px-3 py-2 font-medium">{t.partSerial}</th>
              <th className="text-right px-3 py-2 font-medium">پروژه</th>
              <th className="text-right px-3 py-2 font-medium">دستگاه</th>
              <th className="text-right px-3 py-2 font-medium">{t.status}</th>
              <th className="text-right px-3 py-2 font-medium">تاریخ فروش</th>
            </tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2"><Link to={`/parts/${p.id}`} className="text-brand-600 dark:text-brand-400 hover:underline font-medium">{p.title}</Link></td>
                  <td className="px-3 py-2 fa-nums dark:text-slate-300" dir="ltr">{p.part_number_1 || '—'}</td>
                  <td className="px-3 py-2 fa-nums dark:text-slate-300" dir="ltr">{p.part_serial_number || '—'}</td>
                  <td className="px-3 py-2 dark:text-slate-300">{p.project_name || '—'}</td>
                  <td className="px-3 py-2 fa-nums dark:text-slate-300" dir="ltr">{p.device_serial || '—'}</td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">{formatJalaliLong(p.sold_at_jalali)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
