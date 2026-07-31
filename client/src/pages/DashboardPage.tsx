// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DashboardStats, type Lists, type ReportSummary } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, l, r] = await Promise.all([
          api.get<DashboardStats>('/dashboard/stats'),
          api.get<Lists>('/lists'),
          api.get<ReportSummary>('/reports/summary'),
        ]);
        setStats(s);
        setLists(l);
        setSummary(r);
      } catch { /* handled by global */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.loading}</p>;

  const cards = [
    { label: t.totalDevices, value: stats?.devices ?? 0, icon: '🖥️', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    { label: t.totalParts, value: stats?.parts ?? 0, icon: '🔩', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
    { label: t.activeParts, value: stats?.activeParts ?? 0, icon: '✅', color: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    { label: t.totalReplacements, value: stats?.replacements ?? 0, icon: '🔄', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    { label: t.totalProjects, value: stats?.projects ?? 0, icon: '📁', color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold dark:text-slate-100">{t.navDashboard}</h1>

      {/* کارت‌های آمار */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-4">
            <div className={`text-2xl w-11 h-11 rounded-xl flex items-center justify-center ${c.color}`}>{c.icon}</div>
            <div>
              <div className="text-2xl font-bold fa-nums dark:text-slate-100">{toFa(c.value)}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* آخرین تعویض‌ها */}
        <div className="card">
          <h2 className="text-base font-semibold mb-3 dark:text-slate-100">آخرین تعویض‌های گارنتی</h2>
          {summary && summary.recentReplacements.length > 0 ? (
            <div className="space-y-2">
              {summary.recentReplacements.map((r, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b dark:border-slate-700 last:border-0 text-sm">
                  <div className="dark:text-slate-200">
                    <span className="font-medium">{r.part_title || '—'}</span>
                    <span className="text-gray-400 dark:text-slate-500 mx-2">|</span>
                    <span className="text-gray-500 dark:text-slate-400">{r.project_name || '—'}</span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-slate-500 fa-nums">{formatJalaliLong(r.replaced_at_jalali)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p>
          )}
        </div>

        {/* لیست پروژه‌ها */}
        <div className="card">
          <h2 className="text-base font-semibold mb-3 dark:text-slate-100">پروژه‌ها (مشتریان)</h2>
          {lists && lists.projects.length > 0 ? (
            <div className="space-y-2">
              {lists.projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/dashboard/customer/${p.id}`}
                  className="flex justify-between items-center py-2 border-b dark:border-slate-700 last:border-0 text-sm hover:text-brand-600 dark:hover:text-brand-400 transition"
                >
                  <div className="dark:text-slate-200">
                    <span className="font-medium">{p.name}</span>
                    {p.contract_number && (
                      <span className="text-gray-400 dark:text-slate-500 text-xs mr-2">({p.contract_number})</span>
                    )}
                  </div>
                  <span className="text-gray-400 dark:text-slate-500 text-xs">{p.sales_expert_name || '—'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 dark:text-slate-500 text-sm">{t.noData}</p>
          )}
        </div>
      </div>

      {/* لینک‌های سریع */}
      {isAdmin && (
        <div className="flex flex-wrap gap-3">
          <Link to="/devices/new" className="btn-primary">{t.addDevice}</Link>
          <Link to="/warranty" className="btn-secondary">{t.replacePart}</Link>
          <Link to="/reports" className="btn-secondary">{t.navReports}</Link>
          <Link to="/lists" className="btn-secondary">{t.navLists}</Link>
        </div>
      )}
    </div>
  );
}
