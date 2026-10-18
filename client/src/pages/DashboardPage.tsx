// ============================================================
// داشبورد — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ساختار: هدر خوش‌آمد سِری → کارت‌های آمار با نوار رنگی سمت راست (RTL)
// → بخش دومویی: آخرین تعویض‌ها + پروژه‌ها با آواتار چرخه‌ای
// → نوار پیشرفت تراکوتا + چایپ‌ها + یک CTA اصلی در کل صفحه
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type DashboardStats, type Lists, type ReportSummary } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import { useAuth } from '../context/AuthContext';
import TrendChart from '../components/TrendChart';
import Alert from '../components/Alert';
import VendorContact from '../components/VendorContact';

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
    <section className="card py-4">
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
                    : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800'
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
              className="btn-primary min-h-[32px] text-xs"
              title="ورود کد لایسنس، ارتقای طرح و تمدید — صفحه‌ی لایسنس"
            >
              🔑 ورود کد لایسنس
            </Link>
          )}
          <a
            href="https://hub.docker.com/r/meysam8498/support-equipment-management"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost min-h-[32px] text-xs"
            title="مشاهده‌ی image و راهنمای اجرا در Docker Hub"
          >
            🐳 Docker Hub
          </a>
          <a
            href="https://github.com/meysam8498/Support"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost min-h-[32px] text-xs"
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
  'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'bg-sky-50 text-sky-dark dark:bg-sky-900/30 dark:text-sky-light',
  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
];

/** وضعیت بکاپ برای کارت ادمین (۱.۲۸) — از GET /api/backups */
interface DashboardBackupStatus {
  keep: number;
  atHour: number;
  lastRun: string | null;
  count: number;
  lastResult: { ok: boolean; sizeBytes?: number; integrity?: string; error?: string; push?: { ok: boolean; target: string; error?: string } } | null;
  items: { file: string; sizeBytes: number; mtime: string }[];
  /** تاریخچه‌ی ثبت‌شده در جدول backup_history سرور — داده‌ی نمودار خطی رشد */
  history?: BackupHistoryRow[];
}

/** یک ردیف از تاریخچه‌ی بکاپ‌ها (INSERT هر اجرا در سرور) */
interface BackupHistoryRow {
  ranAt: string;
  source: 'manual' | 'daily' | 'initial' | 'safety';
  ok: boolean;
  file: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  error: string | null;
}

/** برچسب فارسیِ منبع اجرای بکاپ (ستون source در backup_history) */
const BACKUP_SOURCE_LABEL: Record<string, string> = {
  manual: 'دستی',
  daily: 'روزانه',
  initial: 'اولیه',
  safety: 'ایمنی',
};

/** وضعیت کلیدهای امضای لایسنس — GET /license/keys/status (فقط ادمین) */
interface LicenseKeysStatus {
  current_kid: string;
  accepted_kids: string[];
  accepted_count: number;
  has_issue_key: boolean;
  keys_dir: string;
}

/** تاریخچه‌ی چرخش کلید — GET /license/keys/rotations (از rotations.jsonl، فقط ادمین) */
interface LicenseKeyRotations {
  /** مسیر کامل رجیستری روی سرور */
  path: string;
  exists: boolean;
  count: number;
  invalid_lines: number;
  /** جدیدترین چرخش اول */
  rotations: { rotated_at: string; old_kid: string; new_kid: string; archive_ok: boolean; by?: string }[];
}

/** نتیجه‌ی POST /api/backups/run — همان BackupResult سرور */
interface BackupRunResult {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  integrity?: string;
  error?: string;
  push?: { ok: boolean; target: string; error?: string };
}

/** آژیر وضعیت بکاپ — قرمز: خطای واقعی (آخرین بکاپ ناموفق)؛ طلایی: فوریت (قدیمی/بدون بکاپ یا push ناموفق)؛ سبز: سالم */
type BackupAlarm = 'alarm' | 'stale' | 'push' | 'ok';

function backupAlarmOf(b: DashboardBackupStatus | null): BackupAlarm | null {
  if (!b) return null;
  if (b.lastResult?.ok === false) return 'alarm'; // قرمز = خطای واقعی (قانون PipelinePro)
  // فوریت طلایی: هنوز بکاپی نگرفته یا آخرین بکاپ قدیمی‌تر از ۲۶ ساعت (۲ ساعت مانده به روزانه‌ی بعدی)
  if (!b.lastRun || Date.now() - new Date(b.lastRun).getTime() > 26 * 3600 * 1000) return 'stale';
  if (b.lastResult?.push?.target && !b.lastResult.push.ok) return 'push'; // push خارجی ناموفق
  return 'ok';
}

const BACKUP_ALARM_META: Record<BackupAlarm, { cls: string; dot: string; label: string }> = {
  alarm: { cls: 'bg-coral/10 text-coral-dark dark:bg-coral/20 dark:text-coral-light border border-coral/40', dot: 'bg-coral', label: '🚨 بکاپ ناموفق!' },
  stale: { cls: 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40', dot: 'bg-gold', label: '⚠️ بکاپ عقب‌افتاده' },
  push: { cls: 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40', dot: 'bg-gold', label: '↥ push خارجی ناموفق' },
  ok: { cls: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800', dot: 'bg-success', label: '✓ بکاپ سالم' },
};

/** حجم خوانا — KB/MB (هم‌سان BackupsPage) */
function backupSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${toFa(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  return `${toFa((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/** حجم خوانا و کوتاه برای برچسب محور نمودار — KB/MB */
function shortSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${toFa(Math.max(1, Math.round(bytes / 1024)))}KB`;
  return `${toFa((bytes / (1024 * 1024)).toFixed(1))}MB`;
}

/** تاریخ کوتاه شمسی برای برچسب محور x — به وقت تهران، ارقام فارسی */
function axisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' });
}

/**
 * نمودار خطی رشد حجم بکاپ‌ها — داده از جدول backup_history سرور (GET /api/backups.history)
 * SVG سبک بدون وابستگی خارجی؛ هم‌سان با TrendChart: RTLپسند، اسکلول افقیِ برای ردیف‌های زیاد
 */
function BackupSizeChart({ history }: { history: BackupHistoryRow[] }) {
  const rows = history;
  const okIdx = rows.map((h, i) => (h.ok && h.sizeBytes != null ? i : -1)).filter((i) => i >= 0);
  const sizes = okIdx.map((i) => rows[i].sizeBytes as number);
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  const deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
        📈 رشد حجم بکاپ‌ها
        <span className="font-normal text-stone-500 dark:text-stone-400"> — {toFa(rows.length)} اجرای ثبت‌شده در تاریخچه</span>
      </p>
      {okIdx.length >= 2 && (
        <span
          className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 text-[10px] fa-nums"
          title={`رشد حجم فایل بکاپ از اولین تا آخرین بکاپ سالم ثبت‌شده`}
        >
          {deltaPct >= 0 ? '↗' : '↘'} {toFa(Math.abs(deltaPct))}٪ · {shortSize(first)} → {shortSize(last)}
        </span>
      )}
    </div>
  );

  if (rows.length === 0)
    return <>{head}<p className="text-[11px] text-stone-500 dark:text-stone-400">هنوز اجرایی در تاریخچه ثبت نشده است — با اولین بکاپ، تاریخچه اینجا جمع می‌شود.</p></>;
  if (okIdx.length < 2)
    return <>{head}<p className="text-[11px] text-stone-500 dark:text-stone-400">برای رسم خط رشد حداقل ۲ بکاپ سالم لازم است.</p></>;

  const W = Math.max(560, rows.length * 46);
  const H = 170;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const span = Math.max(1, max - min);
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, rows.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const linePts = okIdx.map((i) => `${x(i).toFixed(1)},${y(rows[i].sizeBytes as number).toFixed(1)}`).join(' ');
  const lastIdx = okIdx[okIdx.length - 1];
  const labelEvery = Math.ceil(rows.length / 7); // جلوگیری از شلوغی برچسب‌های محور x

  return (
    <div className="space-y-1">
      {head}
      <div className="overflow-x-auto" role="region" aria-label="نمودار خطی رشد حجم بکاپ‌ها (قابل اسکرول افقی)" tabIndex={0}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نمودار خطی رشد حجم بکاپ‌ها">
          <defs>
            <linearGradient id="backupAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* شبکه‌ی افقی: کف و سقف محدوده‌ی حجم + خط پایه */}
          <line x1={padL} y1={y(max)} x2={W - padR} y2={y(max)} stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth={1} />
          <line x1={padL} y1={y(min)} x2={W - padR} y2={y(min)} stroke="#e4e4e7" strokeDasharray="3 3" strokeWidth={1} />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#a1a1aa" strokeWidth={1} />
          <text x={padL - 6} y={y(max) + 4} textAnchor="end" fontSize={10} fill="#a1a1aa" className="fa-nums">{shortSize(max)}</text>
          <text x={padL - 6} y={y(min) + 4} textAnchor="end" fontSize={10} fill="#a1a1aa" className="fa-nums">{shortSize(min)}</text>
          {/* ناحیه‌ی زیر منحنی */}
          <polygon points={`${padL},${H - padB} ${linePts} ${x(lastIdx).toFixed(1)},${H - padB}`} fill="url(#backupAreaFill)" />
          {/* خط رشد */}
          <polyline points={linePts} fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* نقاط بکاپ سالم — نقطه‌ی آخر برجسته */}
          {okIdx.map((i) => {
            const h = rows[i];
            const isLast = i === lastIdx;
            return (
              <g key={`ok-${i}`}>
                <title>{`${axisDate(h.ranAt)} · ${shortSize(h.sizeBytes as number)} · ${BACKUP_SOURCE_LABEL[h.source] ?? h.source}${h.durationMs != null ? ` · ${toFa(Math.round(h.durationMs / 1000))} ثانیه` : ''}`}</title>
                <circle cx={x(i)} cy={y(h.sizeBytes as number)} r={isLast ? 4.5 : 3} fill={isLast ? '#4F46E5' : '#818CF8'} stroke="#ffffff" strokeWidth={1.5} />
              </g>
            );
          })}
          {/* اجرای ناموفق — نشان قرمز روی خط پایه با دلیل خطا */}
          {rows.map((h, i) => (
            h.ok ? null : (
              <g key={`fail-${i}`}>
                <title>{`${axisDate(h.ranAt)} · بکاپ ناموفق${h.error ? `: ${h.error}` : ''}`}</title>
                <circle cx={x(i)} cy={H - padB} r={3.5} fill="#EF4444" />
              </g>
            )
          ))}
          {/* برچسب محور x — تاریخ شمسی روز اجرا (نقطه‌ی آخر پررنگ) */}
          {rows.map((h, i) => (
            (i % labelEvery === 0 || i === rows.length - 1) ? (
              <text key={`x-${i}`} x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize={9} fill={i === rows.length - 1 ? '#4F46E5' : '#a1a1aa'} fontWeight={i === rows.length - 1 ? 600 : 400}>
                {axisDate(h.ranAt)}
              </text>
            ) : null
          ))}
        </svg>
      </div>
      <p className="text-[10px] text-stone-500 dark:text-stone-400">
        🔴 نقطه‌ی قرمز: اجرای ناموفق · خط آبی: حجم فایل هر بکاپ سالم ثبت‌شده در DB (نگهداری {toFa(500)} ردیف آخر)
      </p>
    </div>
  );
}

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
  // سقف تجهیزات آزمایشی — برای بنر هشدار ارتقا
  const [deviceLimit, setDeviceLimit] = useState<{ limit: number | null; used: number; remaining: number | null; is_trial: boolean; enforce: boolean } | null>(null);
  // وضعیت بکاپ — فقط برای ادمین (GET /api/backups سطح ادمین است)
  const [backup, setBackup] = useState<DashboardBackupStatus | null>(null);
  // بکاپ فوری از کارت داشبورد (POST /api/backups/run) + پیام نتیجه
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  // وضعیت کلیدهای امضای لایسنس — فقط ادمین (keys/status + keys/rotations)
  const [licKeys, setLicKeys] = useState<LicenseKeysStatus | null>(null);
  const [licRots, setLicRots] = useState<LicenseKeyRotations | null>(null);
  const [licKeysErr, setLicKeysErr] = useState<string | null>(null);

  const loadBackup = useCallback(() => {
    api.get<DashboardBackupStatus>('/backups')
      .then(setBackup)
      .catch(() => setBackup(null)); // کارت بکاپ اختیاری است — خطا داشبورد را نمی‌شکند
  }, []);

  useEffect(() => {
    api.get<{ limit: number | null; used: number; remaining: number | null; is_trial: boolean; enforce: boolean }>('/license/device-limit')
      .then(setDeviceLimit)
      .catch(() => setDeviceLimit(null));
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    loadBackup();
    // وضعیت کلیدهای لایسنس — اطلاع‌محور؛ خطا کارت را با پیام قرمز نشان می‌دهد نه داشبورد را
    Promise.all([
      api.get<LicenseKeysStatus>('/license/keys/status'),
      api.get<LicenseKeyRotations>('/license/keys/rotations'),
    ])
      .then(([k, rh]) => { setLicKeys(k); setLicRots(rh); })
      .catch((e) => setLicKeysErr((e as Error & { payload?: { error?: string } }).payload?.error || (e as Error).message));
  }, [user?.role, loadBackup]);

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
        <div className="h-40 rounded-xl bg-surface-card border border-stone-300 dark:bg-indigo-950/40 dark:border-indigo-500/20 animate-pulse" />
      </div>
    );

  // بکاپ فوری همین الان — POST /api/backups/run (همان اندپوینت صفحه‌ی مدیریت بکاپ‌ها)
  const runBackupNow = async () => {
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const r = await api.post<BackupRunResult>('/backups/run', {});
      if (r.ok) {
        setBackupMsg({
          kind: 'success',
          text: `بکاپ فوری گرفته شد (${backupSize(r.sizeBytes ?? 0)})${r.integrity === 'ok' ? ' — سلامت تأیید شد' : ''}${r.push?.target ? (r.push.ok ? ' و به مقصد خارجی فرستاده شد' : ` — ولی push خارجی ناموفق بود: ${r.push.error ?? '?'}`) : ''}.`,
        });
      } else {
        setBackupMsg({ kind: 'danger', text: `بکاپ ناموفق بود${r.error ? `: ${r.error}` : '.'}` });
      }
    } catch (e) {
      // سرور خطا را با 500 برمی‌گرداند — پیام خودش روی آژیر قرمز می‌نشیند
      setBackupMsg({ kind: 'danger', text: `بکاپ ناموفق بود: ${(e as Error).message}` });
    } finally {
      setBackupBusy(false);
      loadBackup(); // شمار نسخه‌ها/آخرین اجرا/آژیر با نتیجه‌ی تازه نوسازی شود
    }
  };

  // نوار پیشرفت قطعات فعال نسبت به کل
  const activeRatio = stats && stats.parts > 0 ? Math.round((stats.activeParts / stats.parts) * 100) : 0;

  const cards = [
    { label: t.totalDevices, value: stats?.devices ?? 0, icon: '🖥️', soft: ACCENT_SOFT[0], accent: ACCENTS[0] },
    { label: t.totalParts, value: stats?.parts ?? 0, icon: '🔩', soft: ACCENT_SOFT[1], accent: ACCENTS[1] },
    { label: t.activeParts, value: stats?.activeParts ?? 0, icon: '✅', soft: ACCENT_SOFT[2], accent: ACCENTS[2] },
    { label: t.totalReplacements, value: stats?.replacements ?? 0, icon: '🔄', soft: ACCENT_SOFT[3], accent: ACCENTS[3] },
    { label: t.totalProjects, value: stats?.projects ?? 0, icon: '📁', soft: ACCENT_SOFT[4], accent: ACCENTS[4] },
  ];

  // هشدار ارتقا — وقتی سقف آزمایشی فعال است و ≤۳ تجهیز باقی مانده
  const upgradeWarn = deviceLimit?.is_trial && deviceLimit.enforce
    && deviceLimit.limit !== null && deviceLimit.remaining !== null && deviceLimit.remaining <= 3;

  return (
    <div className="max-w-[1200px] mx-auto px-6 space-y-8">
      {/* ---------- درباره‌ی سامانه: ورژن + لینک هاب ---------- */}
      <AboutCard />

      {/* ---------- بنر هشدار ارتقا — سقف آزمایشی در حال پر شدن ---------- */}
      {upgradeWarn && (
        <Alert variant="warning">
          فقط <b className="fa-nums">{toFa(deviceLimit?.remaining ?? 0)}</b> تجهیز تا سقف نسخه‌ی آزمایشی
          (<span className="fa-nums">{toFa(deviceLimit?.used ?? 0)}/{toFa(deviceLimit?.limit ?? 0)}</span>) باقی مانده —
          برای افزودن نامحدود، <b>کد لایسنس</b> بگیرید
          {user?.role === 'admin' ? (
            <> — <Link to="/license" className="underline font-semibold">ورود کد لایسنس</Link></>
          ) : (
            <VendorContact />
          )}
        </Alert>
      )}

      {/* ---------- کارت وضعیت آخرین بکاپ — فقط ادمین (با بکاپ فوری + آژیر وضعیت) ---------- */}
      {user?.role === 'admin' && backup && (() => {
        const alarm = backupAlarmOf(backup);
        const meta = alarm ? BACKUP_ALARM_META[alarm] : null;
        return (
          <section className="card card-accent p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-lg shrink-0">🗄️</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-800 dark:text-stone-100">آخرین پشتیبان‌گیری</p>
                  {backup.lastRun ? (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 fa-nums">
                      {new Date(backup.lastRun).toLocaleString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' })}
                      {backup.lastResult?.ok === false && <span className="text-coral"> · آخرین تلاش ناموفق</span>}
                      {backup.lastResult?.ok && backup.lastResult.sizeBytes != null && <> · حجم {backupSize(backup.lastResult.sizeBytes)}</>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">هنوز پشتیبان‌گیری ثبت نشده — زمانبندی روزانه ساعت {toFa(backup.atHour)}:۰۰</p>
                  )}
                </div>
                {/* آژیر وضعیت — نقطه‌ی نبض‌دار + برچسب؛ قمز/طلایی چشمک می‌زند، سبز آرام است */}
                {meta && alarm && (
                  <span className={`badge text-[10px] shrink-0 ${meta.cls}`} title="آژیر وضعیت بکاپ — قرمز: آخرین بکاپ ناموفق؛ طلایی: عقب‌افتاده/بدون بکاپ یا push ناموفق">
                    <span className={`w-2 h-2 rounded-full mr-1.5 shrink-0 ${meta.dot} ${alarm === 'ok' ? '' : 'animate-siren-pulse'}`} aria-hidden />
                    {meta.label}
                  </span>
                )}
                <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 text-[10px] fa-nums shrink-0" title="تعداد نسخه‌های موجود در دیسک (سقف نگهداری)">
                  {toFa(backup.count)} نسخه ذخیره‌شده · سقف {toFa(backup.keep)}
                </span>
                {backup.lastResult?.push?.target && (
                  <span className={`badge text-[10px] shrink-0 ${backup.lastResult.push.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40'}`} title={`مقصد خارجی: ${backup.lastResult.push.target}`}>
                    {backup.lastResult.push.ok ? '↥ ذخیره‌ی خارجی فعال' : '↥ push خارجی ناموفق'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={runBackupNow}
                  disabled={backupBusy}
                  className="btn-primary min-h-[32px] text-xs"
                  title="گرفتن فوری بکاپ از دیتابیس همین الان (POST /api/backups/run) — ادمین"
                >
                  {backupBusy ? '…در حال بکاپ' : '🚨 بکاپ فوری همین الان'}
                </button>
                <Link to="/backups" className="btn-ghost min-h-[32px] text-xs" title="مدیریت بکاپ‌ها: فهرست، بکاپ دستی، بازیابی">
                  مدیریت بکاپ‌ها ←
                </Link>
              </div>
            </div>
            {/* نمودار خطی رشد حجم — از تاریخچه‌ی بکاپ‌های ثبت‌شده در DB (فقط ادمین) */}
            <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-700/60">
              <BackupSizeChart history={backup.history ?? []} />
            </div>
            {backupMsg && (
              <Alert variant={backupMsg.kind} className="mt-3 text-xs leading-5">{backupMsg.text}</Alert>
            )}
          </section>
        );
      })()}

      {/* ---------- کارت وضعیت کلیدهای امضای لایسنس (چرخش/بایگانی/صدور) — فقط ادمین ---------- */}
      {user?.role === 'admin' && (licKeys || licKeysErr) && (() => {
        const lastRot = licRots?.rotations[0] ?? null;
        const latest = licRots && licRots.count > 0 ? lastRot : null;
        return (
          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-lg shrink-0">🔑</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-800 dark:text-stone-100">کلیدهای امضای لایسنس</p>
                  {licKeys ? (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5" title={`پوشه‌ی کلیدها: ${licKeys.keys_dir}`}>
                      kid جاری: <b dir="ltr" className="font-mono">{licKeys.current_kid}</b>
                      {licRots && licRots.count > 0 && <> · {toFa(licRots.count)} چرخش ثبت‌شده</>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-coral mt-0.5">وضعیت کلیدها در دسترس نیست: {licKeysErr}</p>
                  )}
                </div>
                {licKeys && (
                  <>
                    <span
                      className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 text-[10px] fa-nums shrink-0"
                      title={`کلیدهای عمومی پذیرفته‌شده برای تأیید کدهای صادرشده (کدهای قدیمی باطل نمی‌شوند): ${licKeys.accepted_kids.join('، ')}`}
                    >
                      🗝️ {toFa(licKeys.accepted_count || licKeys.accepted_kids.length)} کلید پذیرفته‌شده
                    </span>
                    <span
                      className={`badge text-[10px] shrink-0 ${licKeys.has_issue_key ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40'}`}
                      title="کلید خصوصی صدور کد لایسنس (keys/license_private.pem یا متغیر LICENSE_ISSUE_KEY)"
                    >
                      {licKeys.has_issue_key ? '✓ کلید صدور: موجود' : '⚠️ کلید صدور: مفقود — صدور کد ممکن نیست'}
                    </span>
                    {licRots && licRots.invalid_lines > 0 && (
                      <span
                        className="badge bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40 text-[10px] shrink-0"
                        title="سطرهای قابل‌تحلیل ولی ناقص در رجیستری keys/rotations.jsonl — بررسی کنید"
                      >
                        ⚠ {toFa(licRots.invalid_lines)} سطر خراب در رجیستری
                      </span>
                    )}
                  </>
                )}
              </div>
              <Link to="/issue" className="btn-ghost min-h-[32px] text-xs" title="پنل صدور کد و چرخش کلید: چرخش دستی، تاریخچه‌ی رجیستری، تست صدور با کلید جدید">
                مدیریت کلیدها ←
              </Link>
            </div>
            {/* آخرین چرخش — از رجیستری rotations.jsonl */}
            {latest && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2 fa-nums" title={`رجیستری: ${licRots?.path ?? ''}`}>
                آخرین چرخش: {new Date(latest.rotated_at).toLocaleString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' })}
                {' · '}<b dir="ltr" className="font-mono">{latest.old_kid}</b> ← <b dir="ltr" className="font-mono">{latest.new_kid}</b> (kid جدید)
                {latest.by && <> · توسط {latest.by === 'admin-panel' ? 'پنل ادمین' : latest.by === 'admin-panel-restore' ? 'بازیابی از پنل ادمین' : latest.by}</>}
                {' · '}بایگانی عمومی قدیمی {latest.archive_ok ? '✓ موجود' : '✗ مفقود'}
              </p>
            )}
            {!licKeysErr && licRots && licRots.count === 0 && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2">
                هنوز چرخشی ثبت نشده — رجیستری با اولین چرخش از پنل <Link to="/issue" className="underline font-semibold">ساخت لایسنس</Link> ساخته می‌شود؛ کدهای قبلی همچنان با همین کلید جاری معتبرند.
              </p>
            )}
          </section>
        );
      })()}

      {/* ---------- هدر خوش‌آمد: سِری نمایشی + Overline ---------- */}
      <header className="pt-2">
        <p className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-1">
          {t.appName}
        </p>
        <h1 className="heading-display text-3xl font-bold text-stone-900 dark:text-stone-50">
          {user?.fullName ? `${user.fullName} عزیز، خوش آمدید` : t.navDashboard}
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          نمای کلی تجهیزات، قطعات و پروژه‌های در جریان
        </p>
      </header>

      {/* ---------- کارت‌های آمار PipelinePro: نوار رنگی + اعداد بزرگ Outfit ---------- */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="relative card p-4 overflow-hidden hover:-translate-y-0.5 hover:shadow-md">
            <span className={`absolute inset-y-0 right-0 w-1.5 ${c.accent}`} />
            <div className="flex items-start justify-between mb-3">
              <span className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center ${c.soft}`}>
                {c.icon}
              </span>
            </div>
            <div className="heading-display text-4xl font-bold text-stone-900 dark:text-stone-50 leading-none fa-nums">
              {toFa(c.value)}
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mt-2">{c.label}</div>
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
            <Link to="/reports" className="btn-ghost min-h-[32px] text-xs">گزارش کامل</Link>
          </div>
          {trend.every((m) => m.count === 0) ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm">در ۱۲ ماه اخیر تعویضی ثبت نشده است.</p>
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
            <Link to="/reports" className="btn-ghost min-h-[32px] text-xs">گزارش کامل</Link>
          </div>
          {topFailed.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm">هنوز تعویضی ثبت نشده است.</p>
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
          <Link to="/reports" className="btn-ghost min-h-[32px] text-xs">
            گزارش کامل
          </Link>
        </div>

        {topFailed.length === 0 ? (
          <p className="text-stone-500 dark:text-stone-400 text-sm">
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
                        <span className="text-xs text-stone-500 dark:text-stone-400 fa-nums hidden sm:inline" dir="ltr">
                          {row.part_number_1}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-stone-500 dark:text-stone-400 hidden md:inline fa-nums">
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
            <Link to="/warranty" className="btn-ghost min-h-[32px] text-xs">
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
                    <span className="text-stone-500 dark:text-stone-400 text-xs truncate hidden sm:inline">
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
            <p className="text-stone-500 dark:text-stone-400 text-sm">{t.noData}</p>
          )}
        </div>

        {/* ---------- پروژه‌ها: آواتار حرف اول + چایپ کارشناس ---------- */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-serif text-lg font-bold text-stone-900 dark:text-stone-50">
              پروژه‌ها (مشتریان)
            </h2>
            {canWrite && (
              <Link to="/lists" className="btn-ghost min-h-[32px] text-xs">
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
                          <span className="text-stone-500 dark:text-stone-400 text-xs font-normal mr-1.5" dir="ltr">
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
            <p className="text-stone-500 dark:text-stone-400 text-sm">{t.noData}</p>
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
