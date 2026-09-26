// ============================================================
// داشبورد — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ساختار: هدر خوش‌آمد سِری → کارت‌های آمار با نوار رنگی سمت راست (RTL)
// → بخش دومویی: آخرین تعویض‌ها + پروژه‌ها با آواتار چرخه‌ای
// → نوار پیشرفت تراکوتا + چایپ‌ها + یک CTA اصلی در کل صفحه
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DashboardStats, type Lists, type ReportSummary } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import { useAuth } from '../context/AuthContext';

/** رنگ چرخه‌ای برای نوار کارت‌های آمار و آواتار پروژه‌ها — گرم و هماهنگ با پالت */
const ACCENTS = [
  'bg-brand-500',       // تراکوتا
  'bg-gold',            // کهربا
  'bg-success',         // سبز گرم
  'bg-sky',             // آبی خنثیِ گرم
  'bg-stone-500',       // استون
];
const ACCENT_SOFT = [
  'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  'bg-amber-50 text-gold-dark dark:bg-amber-900/30 dark:text-gold-light',
  'bg-green-50 text-success dark:bg-green-900/30 dark:text-green-300',
  'bg-sky-50 text-sky-dark dark:bg-sky-900/30 dark:text-sky-light',
  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
];

export default function DashboardPage() {
  const { isAdmin, user } = useAuth();
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

  if (loading)
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="h-40 rounded-xl bg-surface-card border border-stone-300 dark:border-stone-700 animate-pulse" />
      </div>
    );

  // نوار پیشرفت قطعات فعال نسبت به کل
  const activeRatio = stats && stats.parts > 0 ? Math.round((stats.activeParts / stats.parts) * 100) : 0;

  const cards = [
    { label: t.totalDevices, value: stats?.devices ?? 0, icon: '🖥️', soft: ACCENT_SOFT[0], accent: ACCENTS[0] },
    { label: t.totalParts, value: stats?.parts ?? 0, icon: '🔩', soft: ACCENT_SOFT[1], accent: ACCENTS[1] },
    { label: t.activeParts, value: stats?.activeParts ?? 0, icon: '✅', soft: ACCENT_SOFT[2], accent: ACCENTS[2] },
    { label: t.totalReplacements, value: stats?.replacements ?? 0, icon: '🔄', soft: ACCENT_SOFT[3], accent: ACCENTS[3] },
    { label: t.totalProjects, value: stats?.projects ?? 0, icon: '📁', soft: ACCENT_SOFT[4], accent: ACCENTS[4] },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-6 space-y-8">
      {/* ---------- هدر خوش‌آمد: سِری نمایشی + Overline ---------- */}
      <header className="pt-2">
        <p className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-1">
          {t.appName}
        </p>
        <h1 className="heading-serif text-3xl font-bold text-stone-900 dark:text-stone-50">
          {user?.fullName ? `${user.fullName} عزیز، خوش آمدید` : t.navDashboard}
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          نمای کلی تجهیزات، قطعات و پروژه‌های در جریان
        </p>
      </header>

      {/* ---------- کارت‌های آمار: نوار رنگی راست (RTL) + عدد سِری ---------- */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card card-accent hover:-translate-y-0.5" style={{ ['--tw-shadow' as string]: undefined }}>
            <span className={`absolute inset-y-0 right-0 w-1 ${c.accent}`} />
            <div className={`text-xl w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.soft}`}>
              {c.icon}
            </div>
            <div className="display-num text-3xl font-bold text-stone-900 dark:text-stone-50 leading-none">
              {toFa(c.value)}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">{c.label}</div>
          </div>
        ))}
      </section>

      {/* ---------- نوار پیشرفت قطعات فعال ---------- */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
            سهم قطعات فعال از کل
          </h2>
          <span className="chip chip-default fa-nums">{toFa(activeRatio)}٪</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${activeRatio}%` }} />
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 fa-nums">
          {toFa(stats?.activeParts ?? 0)} فعال از {toFa(stats?.parts ?? 0)} قطعه
        </p>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------- آخرین تعویض‌ها: ردیف‌های گرم با خط جداکننده ---------- */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">
              آخرین تعویض‌های گارانتی
            </h2>
            <Link to="/warranty" className="btn-ghost !min-h-[32px] text-xs">
              مشاهده همه
            </Link>
          </div>
          {summary && summary.recentReplacements.length > 0 ? (
            <div className="divide-y divide-stone-200 dark:divide-stone-700">
              {summary.recentReplacements.map((r, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ACCENTS[i % ACCENTS.length]}`} />
                    <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                      {r.part_title || '—'}
                    </span>
                    <span className="text-stone-400 dark:text-stone-500 text-xs truncate hidden sm:inline">
                      {r.project_name || ''}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500 dark:text-stone-400 fa-nums shrink-0 mr-2">
                    {formatJalaliLong(r.replaced_at_jalali)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p>
          )}
        </div>

        {/* ---------- پروژه‌ها: آواتار حرف اول + چایپ کارشناس ---------- */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">
              پروژه‌ها (مشتریان)
            </h2>
            {isAdmin && (
              <Link to="/lists" className="btn-ghost !min-h-[32px] text-xs">
                مدیریت
              </Link>
            )}
          </div>
          {lists && lists.projects.length > 0 ? (
            <div className="divide-y divide-stone-200 dark:divide-stone-700">
              {lists.projects.map((p, i) => (
                <Link
                  key={p.id}
                  to={`/dashboard/customer/${p.id}`}
                  className="flex justify-between items-center py-2.5 text-sm rounded-lg transition-colors hover:bg-surface-raised dark:hover:bg-stone-700/60 -mx-2 px-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* آواتار حرف اول با رنگ چرخه‌ای */}
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ACCENT_SOFT[i % ACCENT_SOFT.length]}`}
                    >
                      {p.name.trim().charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {p.name}
                        {p.contract_number && (
                          <span className="text-stone-400 dark:text-stone-500 text-xs font-normal mr-1.5" dir="ltr">
                            ({p.contract_number})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="chip chip-default shrink-0 mr-2">{p.sales_expert_name || '—'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p>
          )}
        </div>
      </div>

      {/* ---------- اکشن‌ها: فقط یک CTA اصلی تراکوتا در کل صفحه ---------- */}
      {isAdmin && (
        <section className="flex flex-wrap gap-3 pb-2">
          <Link to="/devices/new" className="btn-primary">{t.addDevice}</Link>
          <Link to="/warranty" className="btn-secondary">{t.replacePart}</Link>
          <Link to="/reports" className="btn-ghost">{t.navReports}</Link>
          <Link to="/serial-import" className="btn-ghost">ورود سریال از اکسل</Link>
        </section>
      )}
    </div>
  );
}
