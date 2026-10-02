// ============================================================
// صفحه‌ی «لاگ سرور» — نمایشگر لاگ استقرار پشتیبانی (۱.۲۷)
// GET /api/logs با هدر X-Support-Token — فقط وقتی سرور با SUPPORT_ONLY=1 اجرا شده
// نکته: عمداً fetch مستقل از request() مشترک api.ts — چون ۴۰۱ این endpoint
// یعنی «توکن لاگ نامعتبر است» و نباید نشست کاربر را پاک کند یا به /login ریدایرکت شود.
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '../components/Alert';
import { getWithHeaders } from '../api/api';
import { gregorianToJalali, stripLeadingZeros, toFa } from '../lib/date';

interface LogEntry {
  t: string;
  level: 'info' | 'error';
  msg: string;
}

interface LogsResponse {
  version?: string;
  total?: number;
  entries?: LogEntry[];
}

/** کلید ذخیره‌ی توکن در localStorage — فقط همین مرورگر */
const TOKEN_KEY = 'support-log-token';
const LINE_OPTIONS = [50, 100, 150, 200];

/** گزینه‌های فیلتر سطح لاگ — همه/اطلاع/خطا */
const LEVEL_FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'info', label: 'اطلاع' },
  { value: 'error', label: 'خطا' },
] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number]['value'];

/** زمان ISO سرور → «۱۴۰۵/۷/۹ ۱۲:۳۳:۰۵» با تاریخ شمسی */
function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  const jalali = stripLeadingZeros(gregorianToJalali(d) || '');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${toFa(jalali)} ${toFa(`${hh}:${mm}:${ss}`)}`;
}

/** خطا → پیام فارسی روشن بر اساس کد وضعیت */
function describeError(status: number | undefined, raw: string): string {
  if (status === 401) {
    return 'توکن پشتیبانی وارد نشده یا نامعتبر است — توکن درست را وارد کنید (همان مقدار SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN سرور).';
  }
  if (status === 404) {
    return 'این سرور در حالت پشتیبانی (SUPPORT_ONLY=1) اجرا نمی‌شود — صفحه‌ی لاگ فقط در استقرار پشتیبانی فعال است.';
  }
  if (status === 403) return 'خواندن لاگ روی این سرور مجاز نیست.';
  if (status !== undefined) return `خطای ${toFa(status)} هنگام خواندن لاگ${raw ? `: ${raw}` : ''}.`;
  return 'خطای شبکه — سرور در دسترس نیست.';
}

export default function LogViewerPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [showToken, setShowToken] = useState(false);
  const [lines, setLines] = useState(100);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // فیلترهای نمایشی — فقط سمت کلاینت روی entries اعمال می‌شوند (درخواست سرور تغییری نمی‌کند)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [query, setQuery] = useState('');

  // مقادیر جاری در ref — تا interval تازه‌سازی خودکار همیشه آخرین مقدارها را ببیند
  const tokenRef = useRef(token);
  const linesRef = useRef(lines);
  const busyRef = useRef(false);
  tokenRef.current = token;
  linesRef.current = lines;

  const fetchLogs = useCallback(async (silent = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) setLoading(true);
    setError('');
    const tok = tokenRef.current.trim();
    if (!tok) {
      setData(null);
      setError('برای دیدن لاگ، توکن پشتیبانی را وارد کنید — همان مقدار SUPPORT_LOG_TOKEN یا SUPPORT_TOKEN سرور.');
      busyRef.current = false;
      if (!silent) setLoading(false);
      return;
    }
    try {
      const payload = await getWithHeaders<LogsResponse>(`/logs?lines=${linesRef.current}`, {
        'X-Support-Token': tok,
      });
      setData({
        version: String(payload?.version ?? ''),
        total: Number(payload?.total ?? 0),
        entries: Array.isArray(payload?.entries) ? payload.entries : [],
      });
      setLastAt(Date.now());
    } catch (e) {
      setData(null);
      const err = e as { status?: number; message?: string };
      setError(describeError(err.status, err.message || ''));
    } finally {
      busyRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  // اگر توکن ذخیره‌شده داریم، بار اول خودکار بخوان
  useEffect(() => {
    if (tokenRef.current.trim()) fetchLogs();
  }, [fetchLogs]);

  // تازه‌سازی خودکار هر ۱۰ ثانیه (بدون پرش لودینگ)
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => fetchLogs(true), 10_000);
    return () => clearInterval(id);
  }, [auto, fetchLogs]);

  const onTokenChange = (v: string) => {
    setToken(v);
    const trimmed = v.trim();
    if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed);
    else localStorage.removeItem(TOKEN_KEY);
  };

  const toText = () =>
    (data?.entries ?? [])
      .map((e) => `[${formatLogTime(e.t)}] [${e.level}] ${e.msg}`)
      .join('\n');

  const copyAll = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(toText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* بی‌صدا */
    }
  };

  const saveTxt = () => {
    if (!data) return;
    const blob = new Blob([toText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `support-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entries = data?.entries ?? [];

  // فیلتر نمایشی: سطح (اطلاع/خطا) + جست‌وجوی متنی در پیام‌ها (بدون حساسیت به بزرگی حروف)
  const trimmedQuery = query.trim().toLowerCase();
  const visible = entries.filter(
    (e) =>
      (levelFilter === 'all' || e.level === levelFilter) &&
      (!trimmedQuery || e.msg.toLowerCase().includes(trimmedQuery)),
  );
  const filtersActive = levelFilter !== 'all' || trimmedQuery !== '';

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* هدر */}
      <section className="card card-elevated card-accent p-5">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl shadow-glow shrink-0">
            📜
          </span>
          <div className="min-w-0">
            <h1 className="heading-display text-xl font-bold text-stone-900 dark:text-stone-50">لاگ سرور</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-5">
              خواندن آخرین لاگ‌های سرور برای اشکال‌زدایی — فقط در استقرار پشتیبانی (SUPPORT_ONLY=1) فعال است.
              توکن فقط در همین مرورگر ذخیره می‌شود و به هیچ‌جا فرستاده نمی‌شود.
            </p>
          </div>
        </div>
      </section>

      {/* فرم توکن و تنظیمات */}
      <section className="card p-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchLogs();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[240px]">
            <label className="label" htmlFor="log-token">
              توکن پشتیبانی
            </label>
            <div className="relative">
              <input
                id="log-token"
                type={showToken ? 'text' : 'password'}
                className="input !pl-10 font-mono"
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
              {LINE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {toFa(n)} خط آخر
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
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
              {lastAt && (
                <span className="text-stone-400 fa-nums">
                  آخرین خواندن: {formatLogTime(new Date(lastAt).toISOString())}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fetchLogs()} className="btn-secondary !min-h-[32px] text-xs" disabled={loading}>
                ↻ تازه‌سازی
              </button>
              <button type="button" onClick={copyAll} className="btn-ghost !min-h-[32px] text-xs">
                {copied ? '✓ کپی شد' : '📋 کپی'}
              </button>
              <button type="button" onClick={saveTxt} className="btn-ghost !min-h-[32px] text-xs">
                💾 ذخیره‌ی فایل
              </button>
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
                    onClick={() => setLevelFilter(f.value)}
                    aria-pressed={levelFilter === f.value}
                    className={`chip ${
                      levelFilter === f.value
                        ? f.value === 'error'
                          ? 'bg-error text-white border border-transparent'
                          : 'bg-brand-500 text-white border border-transparent'
                        : 'chip-default'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <input
                  id="log-search"
                  type="text"
                  className="input !py-1.5 !pl-9 text-xs"
                  placeholder="جست‌وجو در پیام‌ها…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
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
                  }}
                  className="btn-ghost !min-h-[30px] text-xs"
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
                    {e.level === 'error' ? 'خطا' : 'اطلاع'}
                  </span>
                  <span className="min-w-0 break-all text-stone-700 dark:text-stone-200" dir="auto">
                    {e.msg}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* توضیح فنی */}
      <p className="text-[11px] text-stone-400 leading-5">
        سرور آخرین {toFa(500)} لاگ را در حافظه نگه می‌دارد و با «تعداد خطوط» بخش آخر برگردانده می‌شود. توکن
        پشتیبانی همان مقدار <span dir="ltr" className="font-mono">SUPPORT_LOG_TOKEN</span> یا{' '}
        <span dir="ltr" className="font-mono">SUPPORT_TOKEN</span> سرور است.
      </p>
    </div>
  );
}
