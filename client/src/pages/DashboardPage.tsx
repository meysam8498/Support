// ============================================================
// داشبورد — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ساختار: هدر خوش‌آمد سِری → کارت‌های آمار با نوار رنگی سمت راست (RTL)
// → بخش دومویی: آخرین تعویض‌ها + پروژه‌ها با آواتار چرخه‌ای
// → نوار پیشرفت تراکوتا + چایپ‌ها + یک CTA اصلی در کل صفحه
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type DashboardStats, type Lists, type ReportSummary } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import { useAuth } from '../context/AuthContext';
import TrendChart from '../components/TrendChart';

/** ورژن جاری — از /api/version (در داکر از APP_VERSION/تگ گیت) */
function AboutCard() {
  const [version, setVersion] = useState<string>('…');
  const { isAdmin } = useAuth();
  const [license, setLicense] = useState<{ plan_label: string; days_left: number | null; expired: boolean; licensed_to: string | null } | null>(null);
  const [deviceLimit, setDeviceLimit] = useState<{ limit: number | null; used: number; remaining: number | null; is_trial: boolean; enforce: boolean } | null>(null);
  useEffect(() => {
    api.get<{ version: string }>('/version').then((r) => setVersion(r.version)).catch(() => setVersion('—'));
    api.get<{ plan_label: string; days_left: number | null; expired: boolean; licensed_to: string | null }>('/license').then(setLicense).catch(() => setLicense(null));
    api.get<{ limit: number | null; used: number; remaining: number | null; is_trial: boolean; enforce: boolean }>('/license/device-limit').then(setDeviceLimit).catch(() => setDeviceLimit(null));
  }, []);
  return (
    <section className="card !py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-lg shrink-0">ℹ️</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-800 dark:text-stone-100">درباره‌ی سامانه</p>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
              مدیریت تجهیزات و قطعات یدکی · نسخه <b className="fa-nums" dir="ltr">{version}</b> · طراحی: میثم ایجادی
            </p>
          </div>
          {license && (
            <span
              className={`badge text-[10px] shrink-0 ${
                license.expired
                  ? 'bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40'
                  : deviceLimit?.is_trial && deviceLimit.enforce
                    ? 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40'
                    : 'bg-green-50 text-success dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800'
              }`}
              title={license.licensed_to ? `ثبت‌شده برای: ${license.licensed_to}` : 'وضعیت لایسنس سامانه'}
            >
              📄 لایسنس: {license.plan_label}
              {license.days_left !== null && !license.expired && <> · {toFa(license.days_left)} روز باقی‌مانده</>}
              {license.expired && ' · منقضی‌شده'}
            </span>
          )}
          {deviceLimit?.is_trial && deviceLimit.limit !== null && (
            <span
              className={`badge text-[10px] shrink-0 fa-nums ${
                deviceLimit.enforce && deviceLimit.remaining !== null && deviceLimit.remaining <= 3
                  ? 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
              }`}
              title="سقف تجهیزات نسخه‌ی آزمایشی — برای افزودن نامحدود ارتقا دهید"
            >
              🖥️ {toFa(deviceLimit.used)} / {toFa(deviceLimit.limit)} تجهیز
              {deviceLimit.enforce && deviceLimit.remaining !== null && ` · ${toFa(deviceLimit.remaining)} باقی‌مانده`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link
              to="/license"
              className="btn-primary !min-h-[32px] text-xs"
              title="ورود کد لایسنس، ارتقای طرح و تمدید — صفحه‌ی لایسنس"
            >
              🔑 ورود کد لایسنس
            </Link>
          )}
          <a
            href="https://hub.docker.com/r/meysam8498/support-equipment-management"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !min-h-[32px] text-xs"
            title="مشاهده‌ی image و راهنمای اجرا در Docker Hub"
          >
            🐳 Docker Hub
          </a>
          <a
            href="https://github.com/meysam8498/Support"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !min-h-[32px] text-xs"
            title="سورس کد در گیت‌هاب"
          >
            🐙 GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

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

/** یک سطر از گزارش پرخرابی‌ترین قطعات */
interface FailedPartRow {
  part_title: string;
  part_number_1: string | null;
  replacement_count: number;
  affected_devices: number;
}

/** یک ماه از روند تعویض‌ها */
interface TrendMonth {
  year: number;
  month: number;
  label: string;
  count: number;
}

export default function DashboardPage() {
  const { canWrite, canReplace, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [topFailed, setTopFailed] = useState<FailedPartRow[]>([]);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [trendTotal, setTrendTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, l, r, f, tr] = await Promise.all([
          api.get<DashboardStats>('/dashboard/stats'),
          api.get<Lists>('/lists'),
          api.get<ReportSummary>('/reports/summary'),
          api.get<FailedPartRow[]>('/reports/most-failed-parts?limit=5'),
          api.get<{ months: TrendMonth[]; total: number }>('/reports/replacement-trend'),
        ]);
        setStats(s);
        setLists(l);
        setSummary(r);
        setTopFailed(f);
        setTrend(tr.months);
        setTrendTotal(tr.total);
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
      {/* ---------- درباره‌ی سامانه: ورژن + لینک هاب ---------- */}
      <AboutCard />

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

      {/* ---------- نمودارها: روند ماهانه + پرمصرف‌ترین قطعات ---------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* روند ماهانه‌ی تعویض‌ها (۱۲ ماه شمسی اخیر) */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📈</span>
              <div>
                <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">روند تعویض‌های ماهانه</h2>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  ۱۲ ماه شمسی اخیر · مجموع <b className="fa-nums">{toFa(trendTotal)}</b> تعویض
                </p>
              </div>
            </div>
            <Link to="/reports" className="btn-ghost !min-h-[32px] text-xs">گزارش کامل</Link>
          </div>
          {trend.every((m) => m.count === 0) ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm">در ۱۲ ماه اخیر تعویضی ثبت نشده است.</p>
          ) : (
            <TrendChart
              months={trend}
              pngTitle={`روند تعویض‌های ماهانه (۱۲ ماه اخیر) — مجموع ${trendTotal} تعویض`}
              pngFileName={`replacement-trend-${new Date().toISOString().slice(0, 10)}.png`}
            />
          )}
        </section>

        {/* قطعات پرمصرف (بیشترین تعویض) با نوار رتبه‌ای */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔩</span>
              <div>
                <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">قطعات پرمصرف</h2>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">بیشترین تعویض‌شده در کل سامانه</p>
              </div>
            </div>
            <Link to="/reports" className="btn-ghost !min-h-[32px] text-xs">گزارش کامل</Link>
          </div>
          {topFailed.length === 0 ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm">هنوز تعویضی ثبت نشده است.</p>
          ) : (
            <div className="space-y-3">
              {topFailed.map((row, i) => {
                const max = topFailed[0]?.replacement_count || 1;
                const pct = Math.round((row.replacement_count / max) * 100);
                const barCls = i === 0 ? 'bg-brand-500' : i === 1 ? 'bg-brand-400' : i === 2 ? 'bg-brand-300' : 'bg-stone-400';
                const filterQs = `part=${encodeURIComponent(row.part_title)}${row.part_number_1 ? `&pn=${encodeURIComponent(row.part_number_1)}` : ''}`;
                return (
                  <Link key={`${row.part_title}-${row.part_number_1 ?? ''}-${i}`} to={`/warranty?${filterQs}`} className="group block rounded-lg -mx-2 px-2 hover:bg-brand-50/60 dark:hover:bg-brand-900/20 transition-colors">
                    <div className="flex justify-between items-baseline mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'}`}>
                          {toFa(i + 1)}
                        </span>
                        <span className="font-semibold text-sm text-stone-800 dark:text-stone-100 truncate group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors" dir="auto">
                          {row.part_title}
                        </span>
                      </div>
                      <span className="badge bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/30 fa-nums text-[10px] shrink-0">
                        {toFa(row.replacement_count)} تعویض
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ---------- گزارش سریع: ۵ قطعه با بیشترین خرابی (progress بارهای رتبه‌ای) ---------- */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📉</span>
            <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">
              گزارش سریع — پرخرابی‌ترین قطعات
            </h2>
          </div>
          <Link to="/reports" className="btn-ghost !min-h-[32px] text-xs">
            گزارش کامل
          </Link>
        </div>

        {topFailed.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">
            هنوز تعویض گارانتی ثبت نشده — به‌محض ثبت اولین تعویض، پرخرابی‌ترین قطعات اینجا نمایش داده می‌شوند.
          </p>
        ) : (
          <div className="space-y-3">
            {topFailed.map((row, i) => {
              const max = topFailed[0]?.replacement_count || 1;
              const pct = Math.round((row.replacement_count / max) * 100);
              // رتبه‌ی ۱ تراکوتا؛ بقیه به‌ترتیب اشباع کمتر — رتبه‌بندی بصری فوری
              const barCls = i === 0 ? 'bg-brand-500' : i === 1 ? 'bg-brand-400' : i === 2 ? 'bg-brand-300' : i === 3 ? 'bg-gold' : 'bg-stone-400';
              const filterQs = `part=${encodeURIComponent(row.part_title)}${row.part_number_1 ? `&pn=${encodeURIComponent(row.part_number_1)}` : ''}`;
              return (
                <Link
                  key={`${row.part_title}-${row.part_number_1 ?? ''}-${i}`}
                  to={`/warranty?${filterQs}`}
                  title={`مشاهده‌ی ${toFa(row.replacement_count)} تعویض «${row.part_title}»`}
                  className="group block rounded-lg -mx-2 px-2 hover:bg-brand-50/60 dark:hover:bg-brand-900/20 transition-colors"
                >
                  <div className="flex justify-between items-baseline mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* مدال رتبه */}
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          i === 0
                            ? 'bg-brand-500 text-white'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {toFa(i + 1)}
                      </span>
                      <span className="font-semibold text-stone-800 dark:text-stone-100 truncate group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors" dir="auto">
                        {row.part_title}
                      </span>
                      {row.part_number_1 && (
                        <span className="text-xs text-stone-400 dark:text-stone-500 fa-nums hidden sm:inline" dir="ltr">
                          {row.part_number_1}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 hidden md:inline fa-nums">
                        {toFa(row.affected_devices)} دستگاه
                      </span>
                      <span className="badge bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/30 fa-nums">
                        {toFa(row.replacement_count)} خرابی
                      </span>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${barCls}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
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
            {canWrite && (
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
      <section className="flex flex-wrap gap-3 pb-2">
        {canWrite && <Link to="/devices/new" className="btn-primary">{t.addDevice}</Link>}
        {canReplace && <Link to="/warranty" className="btn-secondary">{t.replacePart}</Link>}
        <Link to="/reports" className="btn-ghost">{t.navReports}</Link>
        {canWrite && <Link to="/serial-import" className="btn-ghost">ورود سریال از اکسل</Link>}
      </section>
    </div>
  );
}
