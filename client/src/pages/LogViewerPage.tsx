// ============================================================
// صفحه‌ی «لاگ سرور» — نمایشگر لاگ + ساخت بسته‌ی پشتیبانی (۱.۲۷ / ۱.۳۰)
// ------------------------------------------------------------
// دو جریان روی «یک» صفحه، که خودکار تشخیص داده می‌شوند:
//   • نسخه‌ی ادمین (استقرار عادی مشتری): با نشست ادمین خوانده می‌شود —
//     هیچ توکنی لازم نیست؛ سقف ۵۰۰ خط (کل حلقه‌ی سرور).
//   • استقرار پشتیبانی (SUPPORT_ONLY=1): با هدر X-Support-Token — همان
//     رفتار قبلی؛ سقف ۲۰۰ خط.
// تشخیص از GET /api/version (support_only) است؛ اگر آن خطا بخورد و کاربر
// ادمین باشد، جریان ادمین انتخاب می‌شود.
//
// نکته‌ی امنیتی: در جریان ادمین از api.get استفاده می‌شود (۴۰۱ = نشست
// منقضی و رفتار عادی اپ). در جریان توکن از getWithHeaders — چون ۴۰۱ آنجا
// یعنی «توکن لاگ نامعتبر» و نباید نشست کاربر را پاک کند یا به /login برود.
//
// خروجی پشتیبانی: فایلی با سربرگ مشخصات (نسخه/زمان/حالت/فیلتر) + همه‌ی
// خطوط بارگذاری‌شده — برای فرستادن به پشتیبانی. زمان هر سطر ISO است تا
// برای پشتیبانی بدون ابهام و قابل ماشین‌خوانی باشد.
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '../components/Alert';
import { api, getWithHeaders } from '../api/api';
import { useAuth } from '../context/AuthContext';
import LastSyncedBadge from '../components/LastSyncedBadge';
import { layoutKeyFor, readLastSynced } from '../lib/dashboardLayout';
import { gregorianToJalali, stripLeadingZeros, toFa } from '../lib/date';

interface LogEntry {
  t: string;
  level: 'info' | 'error';
  msg: string;
}

interface LogsResponse {
  /** حالت پاسخ سرور: ادمین (نشست) یا پشتیبانی (توکن) */
  mode?: 'admin' | 'support';
  support_only?: boolean;
  version?: string;
  /** نسخه‌ی backend — برای بسته‌ی پشتیبانی */
  server_version?: string;
  total?: number;
  entries?: LogEntry[];
}

/** جریان دسترسی صفحه — تا مشخص شود توکن لازم است یا نشست ادمین کافی است */
type LogMode = 'admin' | 'support';

/** کلید ذخیره‌ی توکن در localStorage — فقط همین مرورگر (جریان پشتیبانی) */
const TOKEN_KEY = 'support-log-token';

/** گزینه‌های تعداد خط — ادمین کل حلقه (۵۰۰) را می‌گیرد؛ حالت پشتیبانی سقف ۲۰۰ */
const LINE_OPTIONS: Record<LogMode, number[]> = {
  admin: [100, 200, 500],
  support: [50, 100, 150, 200],
};

/** گزینه‌های فیلتر سطح لاگ — همه/اطلاع/خطا */
const LEVEL_FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'info', label: 'اطلاع' },
  { value: 'error', label: 'خطا' },
] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number]['value'];

/** زمان ISO سرور → «۱۴۰۵/۷/۹ ۱۲:۳۳:۰۵» با تاریخ شمسی (نمایش) */
function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  const jalali = stripLeadingZeros(gregorianToJalali(d) || '');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${toFa(jalali)} ${toFa(`${hh}:${mm}:${ss}`)}`;
}

/** برچسب خوانای سطح لاگ */
const levelLabel = (l: LogEntry['level']) => (l === 'error' ? 'خطا' : 'اطلاع');

/** یکسان‌سازی ارقام فارسی/عربی → لاتین — جست‌وجو به قالب ارقام حساس نباشد */
const toEnDigits = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const normSearch = (s: string) => toEnDigits(s.toLowerCase());

/** هایلایت بخش منطبق با عبارت جست‌وجو در پیام — پس‌زمینه‌ی زرد در هر دو تم */
function Highlight({ text, q }: { text: string; q: string }) {
  const query = q.trim();
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(ql);
  let k = 0;
  while (idx !== -1 && k < 100) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={k++} className="bg-yellow-200 text-stone-900 dark:bg-yellow-400/30 dark:text-yellow-50 rounded-sm px-0.5">
        {text.slice(idx, idx + ql.length)}
      </mark>,
    );
    i = idx + ql.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

/** خطا → پیام فارسی روشن بر اساس کد وضعیت و جریان فعال */
function describeError(status: number | undefined, raw: string, mode: LogMode): string {
  if (status === 401) {
    return mode === 'support'
      ? 'توکن پشتیبانی وارد نشده یا نامعتبر است — توکن درست را وارد کنید (همان مقدار SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN سرور).'
      : 'نشست شما منقضی شده است — دوباره وارد شوید.';
  }
  if (status === 403) {
    return mode === 'support'
      ? 'خواندن لاگ روی این سرور مجاز نیست.'
      : 'خواندن لاگ فقط برای نقش ادمین مجاز است.';
  }
  if (status === 404) {
    return mode === 'support'
      ? 'این سرور در حالت پشتیبانی (SUPPORT_ONLY=1) اجرا نمی‌شود — صفحه‌ی لاگ فقط در استقرار پشتیبانی با توکن فعال است.'
      : 'سرور نسخه‌ی قدیمی است و مسیر خواندن لاگ برای ادمین را ندارد — سرور را به‌روزرسانی کنید.';
  }
  if (status !== undefined) return `خطای ${toFa(status)} هنگام خواندن لاگ${raw ? `: ${raw}` : ''}.`;
  return 'خطای شبکه — سرور در دسترس نیست.';
}

/** نام فایل خروجی با تاریخ میلادی ISO (مرتب‌شدنی و بدون نویسه‌ی ممنوع) */
const exportFileName = (ext: 'txt' | 'json') =>
  `support-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;

export default function LogViewerPage() {
  const { user } = useAuth();
  // زمان آخرین همگام‌سازی چیدمان — همان کلید per-user تخته‌ی داشبورد، برای قابل‌روایت‌ماندن زمان
  const lastSynced = readLastSynced(layoutKeyFor(user?.id));
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [showToken, setShowToken] = useState(false);
  const [mode, setMode] = useState<LogMode | null>(null); // null = هنوز تشخیص داده نشده
  const [lines, setLines] = useState(100);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState<'txt' | 'json' | null>(null);
  // فیلترهای نمایشی — فقط سمت کلاینت روی entries اعمال می‌شوند (درخواست سرور تغییری نمی‌کند)
  // نگه‌داری در query string — لینک قابل اشتراک + حفظ با بازگشت/رفرش صفحه
  const [searchParams, setSearchParams] = useSearchParams();
  const urlLevel = searchParams.get('level') as LevelFilter | null;
  const [levelFilter, setLevelFilter] = useState<LevelFilter>(
    urlLevel && LEVEL_FILTERS.some((f) => f.value === urlLevel) ? urlLevel : 'all',
  );
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  // مقادیر جاری در ref — تا interval تازه‌سازی خودکار همیشه آخرین مقدارها را ببیند
  const modeRef = useRef<LogMode | null>(null);
  const tokenRef = useRef(token);
  const linesRef = useRef(lines);
  const busyRef = useRef(false);
  modeRef.current = mode;
  tokenRef.current = token;
  linesRef.current = lines;

  // ───── تشخیص جریان: /api/version می‌گوید سرور پشتیبانی است یا عادی ─────
  useEffect(() => {
    let alive = true;
    api
      .get<{ support_only?: boolean }>('/version')
      .then((r) => {
        if (!alive) return;
        setMode(r.support_only ? 'support' : 'admin');
      })
      .catch(() => {
        // نسخه خوانده نشد — ادمین بودن کافی‌ترین حدس است
        if (!alive) return;
        setMode(user?.role === 'admin' ? 'admin' : 'support');
      });
    return () => {
      alive = false;
    };
  }, [user?.role]);

  const fetchLogs = useCallback(async (silent = false) => {
    const m = modeRef.current;
    if (!m) return; // هنوز جریان مشخص نشده
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) setLoading(true);
    setError('');
    const n = linesRef.current;
    try {
      let payload: LogsResponse;
      if (m === 'admin') {
        // نشست ادمین — همان request عادی اپ (Bearer خودکار)
        payload = await api.get<LogsResponse>(`/logs?lines=${n}`);
      } else {
        const tok = tokenRef.current.trim();
        if (!tok) {
          setData(null);
          setError('برای دیدن لاگ، توکن پشتیبانی را وارد کنید — همان مقدار SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN سرور.');
          busyRef.current = false;
          if (!silent) setLoading(false);
          return;
        }
        payload = await getWithHeaders<LogsResponse>(`/logs?lines=${n}`, { 'X-Support-Token': tok });
      }
      setData({
        mode: payload?.mode ?? m,
        support_only: !!payload?.support_only,
        version: String(payload?.version ?? ''),
        server_version: String(payload?.server_version ?? ''),
        total: Number(payload?.total ?? 0),
        entries: Array.isArray(payload?.entries) ? payload.entries : [],
      });
      setLastAt(Date.now());
    } catch (e) {
      setData(null);
      const err = e as { status?: number; message?: string };
      setError(describeError(err.status, err.message || '', m));
    } finally {
      busyRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  // در جریان ادمین همان اول خودکار بخوان؛ در جریان پشتیبانی فقط با توکن ذخیره‌شده
  useEffect(() => {
    if (mode === 'admin') fetchLogs();
    else if (mode === 'support' && tokenRef.current.trim()) fetchLogs();
  }, [mode, fetchLogs]);

  // تازه‌سازی خودکار هر ۱۰ ثانیه (بدون پرش لودینگ)
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => fetchLogs(true), 10_000);
    return () => clearInterval(id);
  }, [auto, fetchLogs]);

  /** نوشتن فیلترها در URL — پارامتر خالی حذف می‌شود؛ replace تا history شلوغ نشود */
  const syncFilters = useCallback(
    (level: LevelFilter, q: string) => {
      const p: Record<string, string> = {};
      if (level !== 'all') p.level = level;
      if (q.trim()) p.q = q.trim();
      setSearchParams(p, { replace: true });
    },
    [setSearchParams],
  );

  const onTokenChange = (v: string) => {
    setToken(v);
    const trimmed = v.trim();
    if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed);
    else localStorage.removeItem(TOKEN_KEY);
  };

  const entries = data?.entries ?? [];

  // فیلتر نمایشی: سطح + جست‌وجو در پیام، زمان نمایشی شمسی و سطح (بی‌حساس به بزرگی حروف و قالب ارقام)
  const trimmedQuery = query.trim();
  const nq = normSearch(trimmedQuery);
  const visible = entries.filter((e) => {
    if (levelFilter !== 'all' && e.level !== levelFilter) return false;
    if (!nq) return true;
    return (
      normSearch(e.msg).includes(nq) ||
      normSearch(formatLogTime(e.t)).includes(nq) ||
      normSearch(levelLabel(e.level)).includes(nq) ||
      normSearch(e.level).includes(nq)
    );
  });
  const filtersActive = levelFilter !== 'all' || trimmedQuery !== '';

  // کپی/ذخیره فقط سطرهای فیلترشده — نه کل لاگ
  const toText = (rows: LogEntry[]) =>
    rows.map((e) => `[${formatLogTime(e.t)}] [${e.level}] ${e.msg}`).join('\n');

  // شمارش هر سطح روی کل لاگ‌های خوانده‌شده — برای چیپ‌های فیلتر
  const infoCount = entries.filter((e) => e.level === 'info').length;
  const errorCount = entries.filter((e) => e.level === 'error').length;
  const countOf = (v: LevelFilter) => (v === 'all' ? entries.length : v === 'info' ? infoCount : errorCount);

  const copyAll = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(toText(visible));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* بی‌صدا */
    }
  };

  /** ذخیره‌ی فایل متنی از سطرهای «نمایش‌داده‌شده» (با فیلتر فعلی) */
  const saveTxt = () => {
    if (!data) return;
    const blob = new Blob([toText(visible)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName('txt');
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * بسته‌ی پشتیبانی: سربرگ مشخصات + «همه‌ی» خطوط بارگذاری‌شده (نه فقط فیلترشده).
   * زمان سطرها ISO است تا برای پشتیبانی بدون ابهام و قابل ماشین‌خوانی باشد.
   */
  const buildBundle = (): { meta: Record<string, unknown>; text: string } => {
    const meta = {
      exported_at: new Date().toISOString(),
      product_version: data?.version || '—',
      server_version: data?.server_version || '—',
      access_mode: mode ?? '—',
      support_only: !!data?.support_only,
      total_in_ring: data?.total ?? 0,
      loaded_entries: entries.length,
      active_filter: {
        level: levelFilter,
        query: trimmedQuery || null,
        matched: filtersActive ? visible.length : null,
      },
      exported_by: user?.username ?? '—',
    };
    const header = [
      '══════════════════════════════════════════════════════════',
      ' لاگ سرور — بسته‌ی پشتیبانی',
      '══════════════════════════════════════════════════════════',
      `زمان خروجی (ISO): ${meta.exported_at}`,
      `نسخه‌ی محصول: ${meta.product_version}`,
      `نسخه‌ی سرور: ${meta.server_version}`,
      `حالت دسترسی: ${meta.access_mode === 'admin' ? 'نشست ادمین' : 'توکن پشتیبانی'}${meta.support_only ? ' · سرور پشتیبانی (SUPPORT_ONLY)' : ''}`,
      `کل خطوط در حافظه‌ی سرور: ${meta.total_in_ring} — بارگذاری‌شده: ${meta.loaded_entries}`,
      `فیلتر فعال: سطح=${levelFilter}${trimmedQuery ? ` · عبارت="${trimmedQuery}"` : ''}${filtersActive ? ` · منطبق=${meta.active_filter.matched}` : ' · بدون فیلتر (همه‌ی خطوط بارگذاری‌شده)'}`,
      `توسط: ${meta.exported_by}`,
      '──────────────────────────────────────────────────────────',
      '',
    ].join('\n');
    // سطرهای خام با زمان ISO — خوانا برای انسان و بدون ابهام برای ابزار
    const body = entries.map((e) => `[${e.t}] [${e.level}] ${e.msg}`).join('\n');
    return { meta, text: `${header}${body}\n` };
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** خروجی برای پشتیبانی — متنی (سربرگ + همه‌ی سطرها) یا JSON ساختارمند */
  const exportForSupport = (fmt: 'txt' | 'json') => {
    if (!data) return;
    const { meta, text } = buildBundle();
    if (fmt === 'txt') {
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), exportFileName('txt'));
    } else {
      download(
        new Blob([JSON.stringify({ meta, entries }, null, 2)], { type: 'application/json;charset=utf-8' }),
        exportFileName('json'),
      );
    }
    setExported(fmt);
    setTimeout(() => setExported(null), 2500);
  };

  const lineOptions = LINE_OPTIONS[mode ?? 'support'];
  const modeReady = mode !== null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* هدر */}
      <section className="card card-elevated card-accent p-5">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl shadow-glow shrink-0">
            📜
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="heading-display text-xl font-bold text-stone-900 dark:text-stone-50">لاگ سرور</h1>
              <LastSyncedBadge iso={lastSynced} />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-5">
              {mode === 'support'
                ? 'خواندن آخرین لاگ‌های سرور برای اشکال‌زدایی — استقرار پشتیبانی (SUPPORT_ONLY=1). توکن فقط در همین مرورگر ذخیره می‌شود و به هیچ‌جا فرستاده نمی‌شود.'
                : 'خواندن آخرین لاگ‌های سرور با نشست ادمین و ساخت بسته‌ی خروجی برای فرستادن به پشتیبانی — نیازی به توکن جداگانه نیست.'}
            </p>
          </div>
        </div>
      </section>

      {/* خواندن لاگ — نشست ادمین (بدون توکن) یا توکن پشتیبانی */}
      <section className="card p-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchLogs();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          {mode === 'support' && (
            <div className="flex-1 min-w-[240px]">
              <label className="label" htmlFor="log-token">
                توکن پشتیبانی
              </label>
              <div className="relative">
                <input
                  id="log-token"
                  type={showToken ? 'text' : 'password'}
                  className="input pl-10 font-mono"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="X-Support-Token"
                  value={token}
                  onChange={(e) => onTokenChange(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-stone-400 hover:text-brand-500"
                  title={showToken ? 'پنهان کن' : 'نمایش بده'}
                >
                  {showToken ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          )}
          {mode === 'admin' && (
            <p className="flex-1 min-w-[240px] text-xs text-stone-500 dark:text-stone-400 leading-6">
              با نشست <b className="text-stone-700 dark:text-stone-200">{user?.fullName || user?.username || 'ادمین'}</b>{' '}
              خوانده می‌شود — فقط نقش ادمین اجازه‌ی خواندن لاگ دارد.
            </p>
          )}
          <div className="w-[150px]">
            <label className="label" htmlFor="log-lines">
              تعداد خطوط
            </label>
            <select
              id="log-lines"
              className="input fa-nums"
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
            >
              {lineOptions.map((n) => (
                <option key={n} value={n}>
                  {toFa(n)} خط آخر
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !modeReady}>
            {loading ? '⏳ در حال خواندن…' : '🔍 خواندن لاگ'}
          </button>
        </form>
        <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 select-none">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="accent-brand-500"
          />
          تازه‌سازی خودکار هر ۱۰ ثانیه
        </label>
      </section>

      {/* خطاها */}
      {error && <Alert variant="danger">{error}</Alert>}

      {/* خروجی لاگ */}
      {data && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="badge fa-nums bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600">
                {filtersActive ? (
                  <>
                    نمایش {toFa(visible.length)} از {toFa(entries.length)} لاگ فیلترشده (از {toFa(data.total)} کل)
                  </>
                ) : (
                  <>
                    نمایش {toFa(entries.length)} از {toFa(data.total)} لاگ
                  </>
                )}
              </span>
              {data.version && (
                <span
                  className="badge bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:border-brand-800"
                  dir="ltr"
                >
                  v{data.version}
                </span>
              )}
              {data.server_version && (
                <span
                  className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600"
                  dir="ltr"
                  title="نسخه‌ی backend سرور"
                >
                  server {data.server_version}
                </span>
              )}
              {lastAt && (
                <span className="text-stone-400 fa-nums">
                  آخرین خواندن: {formatLogTime(new Date(lastAt).toISOString())}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fetchLogs()} className="btn-secondary min-h-[32px] text-xs" disabled={loading}>
                ↻ تازه‌سازی
              </button>
              <button type="button" onClick={copyAll} className="btn-ghost min-h-[32px] text-xs">
                {copied ? '✓ کپی شد' : '📋 کپی'}
              </button>
              <button type="button" onClick={saveTxt} className="btn-ghost min-h-[32px] text-xs">
                💾 ذخیره‌ی فایل
              </button>
            </div>
          </div>

          {/* بسته‌ی پشتیبانی — همه‌ی خطوط بارگذاری‌شده + سربرگ مشخصات */}
          <div className="rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-900/20 p-3 mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-stone-600 dark:text-stone-300 leading-5">
                <b>📤 بسته‌ی پشتیبانی:</b> سربرگ مشخصات (نسخه/زمان/حالت/فیلتر) + همه‌ی {toFa(entries.length)} خط بارگذاری‌شده —
                حتی اگر فیلتر فعال باشد. برای فرستادن به پشتیبانی مناسب است.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => exportForSupport('txt')}
                  className="btn-primary min-h-[32px] text-xs"
                  title="دانلود فایل متنی با سربرگ مشخصات و همه‌ی خطوط بارگذاری‌شده"
                >
                  {exported === 'txt' ? '✓ دانلود شد' : '⬇ متنی (txt)'}
                </button>
                <button
                  type="button"
                  onClick={() => exportForSupport('json')}
                  className="btn-ghost min-h-[32px] text-xs"
                  title="دانلود JSON ساختارمند (مشخصات + entries) برای ابزارها"
                >
                  {exported === 'json' ? '✓ دانلود شد' : 'JSON'}
                </button>
              </div>
            </div>
          </div>

          {/* فیلترها: سطح + جست‌وجو در پیام‌ها — فقط سمت کلاینت */}
          {entries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex items-center gap-1" role="group" aria-label="فیلتر سطح لاگ">
                {LEVEL_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { setLevelFilter(f.value); syncFilters(f.value, query); }}
                    aria-pressed={levelFilter === f.value}
                    className={`chip ${
                      levelFilter === f.value
                        ? f.value === 'error'
                          ? 'bg-error text-white border border-transparent'
                          : 'bg-brand-500 text-white border border-transparent'
                        : 'chip-default'
                    }`}
                  >
                    {f.label} <span className="fa-nums opacity-80">({toFa(countOf(f.value))})</span>
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <input
                  id="log-search"
                  type="text"
                  className="input py-1.5 pl-9 text-xs"
                  placeholder="جست‌وجو در پیام، زمان یا سطح…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); syncFilters(levelFilter, e.target.value); }}
                />
                <span
                  aria-hidden
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 pointer-events-none"
                >
                  🔎
                </span>
              </div>
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setLevelFilter('all');
                    setQuery('');
                    syncFilters('all', '');
                  }}
                  className="btn-ghost min-h-[30px] text-xs"
                >
                  ✕ پاک‌کردن فیلترها
                </button>
              )}
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400 text-center py-6">
              لاگی در حافظه‌ی سرور ثبت نشده است.
            </p>
          ) : visible.length === 0 ? (
            <Alert variant="info">
              هیچ لاگی با این فیلترها یافت نشد — سطح یا عبارت جست‌وجو را تغییر دهید.
            </Alert>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {visible.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-xs leading-6">
                  <span className="shrink-0 text-stone-400 fa-nums" title={e.t}>
                    {formatLogTime(e.t)}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 font-semibold ${
                      e.level === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-coral-light'
                        : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                    }`}
                  >
                    {levelLabel(e.level)}
                  </span>
                  <span className="min-w-0 break-all text-stone-700 dark:text-stone-200" dir="auto">
                    <Highlight text={e.msg} q={trimmedQuery} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* توضیح فنی */}
      <p className="text-[11px] text-stone-400 leading-5">
        سرور آخرین {toFa(500)} لاگ را در حافظه نگه می‌دارد. در نسخه‌ی ادمین تا {toFa(500)} خط آخر با نشست خوانده
        می‌شود؛ در استقرار پشتیبانی سقف {toFa(200)} خط است و توکن همان مقدار{' '}
        <span dir="ltr" className="font-mono">SUPPORT_LOG_TOKEN</span> یا{' '}
        <span dir="ltr" className="font-mono">SUPPORT_TOKEN</span> سرور است.
      </p>
    </div>
  );
}
