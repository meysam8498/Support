// ============================================================
// نمودار خطی رشد حجم بکاپ‌ها — داده از جدول backup_history سرور (GET /api/backups.history)
// SVG سبک بدون وابستگی خارجی؛ هم‌سان با TrendChart: RTLپسند، اسکرول افقی برای ردیف‌های زیاد
// مشترک بین داشبورد و صفحه‌ی مدیریت بکاپ‌ها (۱.۳۰) — منبع واحد هشدار سقف تاریخچه هم همین‌جاست.
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useRef } from 'react';
import { toFa } from '../lib/date';
import { exportChartPng } from './TrendChart';

/** یک ردیف از تاریخچه‌ی بکاپ‌ها (INSERT هر اجرا در سرور) */
export interface BackupHistoryRow {
  ranAt: string;
  source: 'manual' | 'daily' | 'initial' | 'safety';
  ok: boolean;
  file: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  error: string | null;
  pushOk?: boolean | null;
  pushTarget?: string | null;
  pushError?: string | null;
}

/** سقف نگهداری تاریخچه — capped یعنی قدیمی‌ترین ردیف‌ها در حال حذف‌شدن‌اند (هشدار UI) */
export interface BackupHistoryMeta {
  total: number;
  keep: number;
  capped: boolean;
}

/** برچسب فارسیِ منبع اجرای بکاپ (ستون source در backup_history) */
export const BACKUP_SOURCE_LABEL: Record<string, string> = {
  manual: 'دستی',
  daily: 'روزانه',
  initial: 'اولیه',
  safety: 'ایمنی',
};

/** حجم خوانا و کوتاه برای برچسب محور نمودار — KB/MB */
function shortSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${toFa(Math.max(1, Math.round(bytes / 1024)))}KB`;
  return `${toFa((bytes / (1024 * 1024)).toFixed(1))}MB`;
}

/** تاریخ کوتاه شمسی برای برچسب محور x — به وقت تهران، ارقام فارسی */
function axisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' });
}

interface BackupChartProps {
  history: BackupHistoryRow[];
  meta?: BackupHistoryMeta;
  /** عنوان بالای PNG — اگر داده شود، دکمه‌ی خروجی PNG (هم‌سبک نمودار روند) نمایش داده می‌شود */
  pngTitle?: string;
  /** نام فایل PNG (پیش‌فرض: backup-history-YYYY-MM-DD.png) */
  pngFileName?: string;
}

export function BackupSizeChart({ history, meta, pngTitle, pngFileName }: BackupChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
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
      {/* هشدار سقف تاریخچه — طلایی (فوریت/اطلاع؛ قرمز فقط خطای واقعی است) */}
      {meta?.capped && (
        <span
          className="badge bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40 text-[10px] fa-nums shrink-0"
          title={`جدول تاریخچه به سقف نگهداری رسیده است (${toFa(meta.keep)} ردیف) — با هر اجرای جدید، قدیمی‌ترین ردیف حذف می‌شود`}
        >
          ⚠️ سقف تاریخچه ({toFa(meta.keep)} ردیف) پر شد — قدیمی‌ترین‌ها حذف می‌شوند
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
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نمودار خطی رشد حجم بکاپ‌ها">
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
        🔴 نقطه‌ی قرمز: اجرای ناموفق · خط آبی: حجم فایل هر بکاپ سالم ثبت‌شده در DB (نگهداری {toFa(meta?.keep ?? 500)} ردیف آخر{meta ? ` · ثبت‌شده: ${toFa(meta.total)}` : ''})
      </p>
      {/* خروجی PNG — همان مسیر exportChartPng نمودار روند (canvas 2x، پس‌زمینه روشن، عنوان فارسی) */}
      {pngTitle && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              void exportChartPng(
                svgRef.current,
                pngFileName || `backup-history-${new Date().toISOString().slice(0, 10)}.png`,
                pngTitle,
              ).catch(() => { /* noop */ });
            }}
            className="btn-ghost min-h-[28px] text-[11px]"
            title="دانلود نمودار به‌صورت تصویر PNG برای گزارش"
          >
            🖼️ خروجی PNG
          </button>
        </div>
      )}
    </div>
  );
}

export default BackupSizeChart;
