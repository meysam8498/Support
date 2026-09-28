// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • گزارش‌های تحلیلی: پرخرابی‌ترین قطعات، خرابی بر اساس مشتری/دلیل/نوع دستگاه
// • جست‌وجوی متنی روی نتایج با هایلایت عبارت + خط متا (قرارداد، تاریخ‌ها، وضعیت)
// • جست‌وجوی تاریخ بازه‌ای (از/تا شمسی) — فیلتر تعویض‌ها روی همه‌ی گزارش‌ها
// • کلیک روی ردیف قطعه → فهرست فیلترشده‌ی تعویض‌های همان قطعه
// • کلیک روی ردیف مشتری → فهرست فیلترشده‌ی تعویض‌های همان پروژه
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa, formatJalaliLong } from '../lib/date';
import ExportColumnsDialog from '../components/ExportColumnsDialog';
import PeriodicReportDialog from '../components/PeriodicReportDialog';

interface FailedPart { part_title: string; part_number_1?: string; replacement_count: number; affected_devices: number; }
interface FailureByCustomer { project_id: number; project_name: string; claims_count: number; affected_devices: number; distinct_failures: number; }
interface FailureByReason { failure_reason_id: number; failure_reason_name: string; replacement_count: number; affected_devices: number; affected_customers: number; }
interface ServiceNeed { device_type_id: number; device_type_name: string; total_devices: number; total_parts: number; total_replacements: number; replacements_per_device: number; }
interface ReplacementRow {
  id: number; replaced_at_jalali: string; description: string | null;
  device_id: number; device_serial: string | null; project_name: string | null;
  old_part_title: string | null; old_part_serial: string | null;
  new_part_title: string | null; new_part_serial: string | null;
  expert_name: string | null; failure_reason_name: string | null;
}

/** قطعه‌بندی متن برای هایلایت عبارت جست‌وجو (case-insensitive) */
function splitHighlight(text: string, term: string): { part: string; hit: boolean }[] {
  if (!term || !text) return [{ part: text, hit: false }];
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const out: { part: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) { out.push({ part: text.slice(i), hit: false }); break; }
    if (at > i) out.push({ part: text.slice(i, at), hit: false });
    out.push({ part: text.slice(at, at + term.length), hit: true });
    i = at + term.length;
  }
  return out.length ? out : [{ part: text, hit: false }];
}

function Highlight({ text, term }: { text: string; term: string }) {
  return (
    <>
      {splitHighlight(text, term).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-amber-200/70 dark:bg-amber-400/30 text-inherit rounded-[3px] px-0.5">{p.part}</mark>
        ) : (
          <React.Fragment key={i}>{p.part}</React.Fragment>
        ),
      )}
    </>
  );
}

function BarRow({ label, value, max, color, term }: { label: string; value: number; max: number; color: string; term: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-stone-700 dark:text-stone-200"><Highlight text={label} term={term} /></span>
        <span className="font-medium fa-nums text-stone-500 dark:text-stone-400">{toFa(value)}</span>
      </div>
      <div className="h-2.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** نرمال‌سازی تاریخ شمسی ورودی کاربر برای مقایسه (1404/5/3 == 1404/05/03) */
function normJ(s: string): string {
  const m = s.trim().match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (!m) return s.trim();
  return `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [failed, setFailed] = useState<FailedPart[]>([]);
  const [byCust, setByCust] = useState<FailureByCustomer[]>([]);
  const [byReason, setByReason] = useState<FailureByReason[]>([]);
  const [service, setService] = useState<ServiceNeed[]>([]);
  const [replacements, setReplacements] = useState<ReplacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [periodicOpen, setPeriodicOpen] = useState(false);

  // جست‌وجوی متنی + بازه‌ی تاریخ شمسی (از/تا)
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateHelp, setShowDateHelp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [f, c, r, s, reps] = await Promise.all([
          api.get<FailedPart[]>('/reports/most-failed-parts'),
          api.get<FailureByCustomer[]>('/reports/failures-by-customer'),
          api.get<FailureByReason[]>('/reports/failures-by-reason'),
          api.get<ServiceNeed[]>('/reports/service-needs-by-type'),
          api.get<ReplacementRow[]>('/warranty/replacements'),
        ]);
        setFailed(f); setByCust(c); setByReason(r); setService(s); setReplacements(reps);
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, []);

  // فیلتر تعویض‌ها بر اساس متن + بازه‌ی تاریخ (شمسی)
  const filteredReps = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const from = dateFrom.trim() ? normJ(dateFrom) : '';
    const to = dateTo.trim() ? normJ(dateTo) : '';
    return replacements.filter((r) => {
      if (from || to) {
        const d = normJ(r.replaced_at_jalali || '');
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (!needle) return true;
      return [r.project_name, r.device_serial, r.old_part_title, r.old_part_serial, r.new_part_title, r.new_part_serial, r.expert_name, r.failure_reason_name, r.replaced_at_jalali, r.description]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(needle));
    });
  }, [replacements, q, dateFrom, dateTo]);

  // متای هر تعویض برای نمایش زیر ردیف
  const repMeta = (r: ReplacementRow): string =>
    [
      r.failure_reason_name && `دلیل: ${r.failure_reason_name}`,
      r.expert_name && `کارشناس: ${r.expert_name}`,
      r.new_part_serial && `سریال جدید: ${r.new_part_serial}`,
    ].filter(Boolean).join(' · ');

  // شمارش تعویض‌های فیلترشده به تفکیک قطعه/مشتری برای اعدادِ گزارش‌ها
  const countByPart = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredReps) {
      const key = `${r.old_part_title || '(بدون عنوان)'}|${''}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [filteredReps]);
  const countByCustomer = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of filteredReps) {
      // project_name از rows می‌آید؛ برای شمارش روی project_id به فیلد نیاز داریم — با نام کار می‌کنیم
    }
    return m;
  }, [filteredReps]);
  void countByCustomer;

  const term = q.trim();

  // داده‌های گزارش با فیلتر بازه (فقط وقتی بازه/متن فعال است اعداد عوض می‌شوند)
  const dateFilterActive = Boolean(dateFrom.trim() || dateTo.trim());
  const failedShown = dateFilterActive
    ? failed
        .map((f) => ({
          ...f,
          replacement_count: filteredReps.filter((r) => (r.old_part_title || '(بدون عنوان)') === f.part_title).length,
        }))
        .filter((f) => f.replacement_count > 0)
        .sort((a, b) => b.replacement_count - a.replacement_count)
    : failed;
  const byCustShown = dateFilterActive
    ? byCust
        .map((c) => ({
          ...c,
          claims_count: filteredReps.filter((r) => r.project_name === c.project_name).length,
        }))
        .filter((c) => c.claims_count > 0)
    : byCust;

  if (loading) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.loading}</p>;

  const maxFailed = Math.max(1, ...failedShown.map((x) => x.replacement_count));
  const maxCust = Math.max(1, ...byCustShown.map((x) => x.claims_count));
  const maxReason = Math.max(1, ...byReason.map((x) => x.replacement_count));
  const hasSearch = Boolean(term || dateFilterActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold dark:text-stone-50">{t.navReports}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPeriodicOpen(true)}
            className="btn-secondary !min-h-[34px] text-xs"
          >
            🗓️ گزارش دوره‌ای
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="btn-secondary !min-h-[34px] text-xs"
          >
            ⬇ خروجی اکسل تعویض‌ها
          </button>
        </div>
      </div>

      {/* ---------- نوار جست‌وجو + بازه‌ی تاریخ ---------- */}
      <div className="card !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">🔍</span>
            <input
              className="input !pr-10"
              placeholder="جست‌وجو در نتایج: قطعه، سریال، پروژه، کارشناس، دلیل…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              dir="auto"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">از تاریخ</label>
            <input
              className="input !min-h-[36px] !w-[110px] fa-nums text-center"
              placeholder="1404/01/01"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              dir="ltr"
            />
            <label className="text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">تا</label>
            <input
              className="input !min-h-[36px] !w-[110px] fa-nums text-center"
              placeholder="1404/12/29"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              dir="ltr"
            />
            {(dateFrom || dateTo || q) && (
              <button
                type="button"
                onClick={() => { setQ(''); setDateFrom(''); setDateTo(''); }}
                className="btn-ghost !min-h-[36px] text-xs"
                title="پاک کردن همه‌ی فیلترها"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowDateHelp((s) => !s)}
              className="btn-ghost !min-h-[36px] text-xs"
              title="راهنما"
            >
              ؟
            </button>
          </div>
        </div>
        {showDateHelp && (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400 bg-surface-raised dark:bg-stone-800/60 rounded-lg p-2.5">
            تاریخ‌ها شمسی و به‌صورت <b dir="ltr">1404/05/12</b> — فیلتر «از/تا» روی فهرست تعویض‌ها و اعداد گزارش‌های پرخرابی قطعات و مشتریان اعمال می‌شود. جست‌وجوی متنی هم روی همه‌ی فیلدها (شامل توضیحات) کار می‌کند.
          </p>
        )}
        {hasSearch && (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400 fa-nums">
            {toFa(filteredReps.length)} تعویض در این فیلتر
            {dateFilterActive && <> · بازه: {dateFrom || '…'} تا {dateTo || '…'}</>}
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* پرخرابی‌ترین قطعات — کلیک → فهرست فیلترشده */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-stone-50">{t.mostFailed}</h2>
          {failedShown.length === 0 ? <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p> : (
            failedShown.map((f) => (
              <Link
                key={f.part_title + (f.part_number_1 || '')}
                to={`/warranty?part=${encodeURIComponent(f.part_title)}${f.part_number_1 ? `&pn=${encodeURIComponent(f.part_number_1)}` : ''}`}
                title={`مشاهده‌ی تعویض‌های «${f.part_title}»`}
                className="block rounded-lg -mx-2 px-2 hover:bg-brand-50/60 dark:hover:bg-brand-900/20 transition-colors"
              >
                <BarRow
                  label={`${f.part_title}${f.part_number_1 && f.part_number_1 !== '(بدون پارت‌نامبر)' ? ` (${f.part_number_1})` : ''}`}
                  value={f.replacement_count} max={maxFailed} color="bg-red-500" term={term}
                />
              </Link>
            ))
          )}
        </div>

        {/* خرابی بر اساس مشتری — کلیک → فهرست فیلترشده‌ی پروژه */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-stone-50">{t.failuresByCustomer}</h2>
          {byCustShown.length === 0 ? <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p> : (
            byCustShown.map((c) => (
              <Link
                key={c.project_id}
                to={`/warranty?project=${c.project_id}&name=${encodeURIComponent(c.project_name)}`}
                title={`مشاهده‌ی تعویض‌های پروژه «${c.project_name}»`}
                className="block rounded-lg -mx-2 px-2 hover:bg-brand-50/60 dark:hover:bg-brand-900/20 transition-colors"
              >
                <BarRow label={c.project_name} value={c.claims_count} max={maxCust} color="bg-amber-500" term={term} />
              </Link>
            ))
          )}
        </div>

        {/* خرابی بر اساس دلیل */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2 dark:text-stone-50">{t.failuresByReason}</h2>
          {byReason.length === 0 ? <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p> : (
            byReason.map((r) => (
              <BarRow key={r.failure_reason_id} label={r.failure_reason_name} value={r.replacement_count} max={maxReason} color="bg-purple-500" term={term} />
            ))
          )}
        </div>

        {/* نیاز خدمات به تفکیک نوع دستگاه */}
        <div className="card">
          <h2 className="text-base font-semibold mb-3 dark:text-stone-50">{t.serviceNeeds}</h2>
          {service.length === 0 ? <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                  <th className="text-right px-3 py-2 font-medium">نوع</th>
                  <th className="text-center px-3 py-2 font-medium">دستگاه</th>
                  <th className="text-center px-3 py-2 font-medium">قطعه</th>
                  <th className="text-center px-3 py-2 font-medium">تعویض</th>
                  <th className="text-center px-3 py-2 font-medium">نسبت</th>
                </tr></thead>
                <tbody>
                  {service.map((s) => (
                    <tr key={s.device_type_id} className="border-b dark:border-stone-700">
                      <td className="px-3 py-2 font-medium dark:text-stone-200"><Highlight text={s.device_type_name} term={term} /></td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-stone-300">{toFa(s.total_devices)}</td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-stone-300">{toFa(s.total_parts)}</td>
                      <td className="px-3 py-2 text-center fa-nums dark:text-stone-300">{toFa(s.total_replacements)}</td>
                      <td className="px-3 py-2 text-center fa-nums">
                        <span className={`badge ${s.replacements_per_device >= 1 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>{toFa(s.replacements_per_device)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---------- فهرست تعویض‌های فیلترشده با هایلایت و متا ---------- */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-base font-semibold dark:text-stone-50">تعویض‌های مطابق فیلتر</h2>
          <span className="chip chip-default fa-nums text-xs">{toFa(filteredReps.length)} ردیف</span>
        </div>
        {filteredReps.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm text-center py-6">
            {hasSearch ? 'هیچ تعویضی با این فیلتر پیدا نشد.' : 'هنوز تعویضی ثبت نشده است.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredReps.slice(0, 100).map((r) => (
              <div key={r.id} className="border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 text-sm hover:bg-brand-50/40 dark:hover:bg-brand-900/15 transition-colors">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-red-600 dark:text-red-400" dir="auto">
                      <Highlight text={r.old_part_title || '؟'} term={term} />
                    </span>
                    {r.old_part_serial && <span className="text-[11px] text-stone-400 dark:text-stone-500 fa-nums mr-1.5" dir="ltr">(<Highlight text={r.old_part_serial} term={term} />)</span>}
                    <span className="mx-2 text-stone-400 dark:text-stone-500">→</span>
                    <span className="font-medium text-green-600 dark:text-green-400" dir="auto">
                      <Highlight text={r.new_part_title || '؟'} term={term} />
                    </span>
                    {r.new_part_serial && <span className="text-[11px] text-stone-400 dark:text-stone-500 fa-nums mr-1.5" dir="ltr">(<Highlight text={r.new_part_serial} term={term} />)</span>}
                  </div>
                  <span className="text-xs text-stone-400 dark:text-stone-500 fa-nums whitespace-nowrap">
                    <Highlight text={formatJalaliLong(r.replaced_at_jalali)} term={term} />
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                  <Link to={`/devices/${r.device_id}`} className="fa-nums hover:text-brand-600 dark:hover:text-brand-300" dir="ltr">
                    <Highlight text={r.device_serial || '—'} term={term} />
                  </Link>
                  <span dir="auto"><Highlight text={r.project_name || ''} term={term} /></span>
                  <span>{repMeta(r)}</span>
                  {r.description && <span className="truncate max-w-[300px]" dir="auto"><Highlight text={r.description} term={term} /></span>}
                </div>
              </div>
            ))}
            {filteredReps.length > 100 && (
              <p className="text-xs text-stone-400 dark:text-stone-500 text-center fa-nums">… {toFa(filteredReps.length - 100)} ردیف دیگر (برای دیدن همه، فیلتر را محدودتر کنید)</p>
            )}
          </div>
        )}
      </div>

      {/* دیالوگ خروجی اکسل با انتخاب ستون‌ها */}
      <ExportColumnsDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <PeriodicReportDialog open={periodicOpen} onClose={() => setPeriodicOpen(false)} />
    </div>
  );
}
