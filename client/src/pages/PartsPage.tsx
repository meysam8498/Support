// ============================================================
// فهرست قطعات — سیستم طراحی Flip7
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// قابلیت ضدتکرار: قطعاتی که «پارت‌نامبر یکسان» دارند با نشان «تکراری»
// گروه نمایش داده می‌شوند و می‌توان توضیح درست را برای همه انتخاب کرد
// (به‌روزرسانی گروهی tech_specs — بدون حذف داده).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Part } from '../api/api';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { downloadAuthenticated } from '../lib/download';
import InlineEditCell from '../components/InlineEditCell';

type InlineField = 'part_serial_number' | 'part_number_1' | 'tech_specs';

export default function PartsPage() {
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // فیلتر مرجع کاتالوگ از URL (لینک «نصب‌شده‌ها» در تب کاتالوگ)
  const catalogFilter = searchParams.get('catalog') ?? '';
  const [catalogTitle, setCatalogTitle] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dupOnly, setDupOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [descDialog, setDescDialog] = useState<{ pn: string; group: Part[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pageError, setPageError] = useState('');
  // جست‌وجوی فوری سریال — query زنده به سرور (بدون بارگذاری همه‌ی قطعات)
  const [serialSearch, setSerialSearch] = useState('');
  const [serialHits, setSerialHits] = useState<Part[] | null>(null);
  const [serialBusy, setSerialBusy] = useState(false);
  // دیالوگ «صاحب سریال» — قطعاتی که همین سریال را دارند
  const [ownerDialog, setOwnerDialog] = useState<{ serial: string; matches: { id: number; title: string; part_serial_number: string | null; status: string; device_id: number | null; device_serial: string | null; project_name: string | null }[] } | null>(null);

  /** خروجی اکسل فهرست انبار — با فیلترهای فعال فعلی */
  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      await downloadAuthenticated(
        `/parts/export/warehouse${qs ? `?${qs}` : ''}`,
        'parts-warehouse.xlsx'
      );
    } catch (err) {
      setPageError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const load = async () => {
    try {
      const qs = catalogFilter ? `?catalog=${encodeURIComponent(catalogFilter)}` : '';
      setParts(await api.get<Part[]>(`/parts${qs}`));
      if (catalogFilter) {
        // عنوان مرجع برای بج فیلتر
        api.get<{ title?: string }>(`/part-catalog/${catalogFilter}`).then((c) => setCatalogTitle(c.title || '')).catch(() => {});
      } else {
        setCatalogTitle('');
      }
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [catalogFilter]);

  // جست‌وجوی فوری سریال — debounce ۲۵۰ms به سرور (سرور case/فاصله‌ناحساس)
  useEffect(() => {
    const s = serialSearch.trim();
    if (!s) { setSerialHits(null); setSerialBusy(false); return; }
    setSerialBusy(true);
    const timer = setTimeout(async () => {
      try {
        setSerialHits(await api.get<Part[]>(`/parts?serial=${encodeURIComponent(s)}`));
      } catch { setSerialHits(null); }
      finally { setSerialBusy(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [serialSearch]);

  /** کلیک روی سریال تکراری → دیالوگ «صاحب سریال» */
  const openSerialOwner = async (serial: string) => {
    try {
      const r = await api.get<{ exists: boolean; matches: { id: number; title: string; part_serial_number: string | null; status: string; device_id: number | null; device_serial: string | null; project_name: string | null }[] }>(
        `/parts/serial-check?serial=${encodeURIComponent(serial)}`,
      );
      setOwnerDialog({ serial, matches: r.matches || [] });
    } catch (e) { setPageError((e as Error).message); }
  };

  // قطعاتی که سریالشان با قطعه‌ی دیگرِ فهرست یکی است (درون همین صفحه)
  const dupSerialIds = useMemo(() => {
    const seen = new Map<string, number>();
    const ids = new Set<number>();
    for (const p of parts) {
      const s = (p.part_serial_number || '').trim().toUpperCase();
      if (!s) continue;
      if (seen.has(s)) { ids.add(seen.get(s)!); ids.add(p.id); }
      else seen.set(s, p.id);
    }
    return ids;
  }, [parts]);

  // گروه‌بندی بر اساس پارت‌نامبر نرمال‌شده برای پیدا کردن تکراری‌ها
  const pnGroups = useMemo(() => {
    const g = new Map<string, Part[]>();
    for (const p of parts) {
      const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
      if (!pn) continue;
      if (!g.has(pn)) g.set(pn, []);
      g.get(pn)!.push(p);
    }
    return g;
  }, [parts]);

  const dupPns = useMemo(
    () => new Set([...pnGroups.entries()].filter(([, arr]) => arr.length > 1).map(([pn]) => pn)),
    [pnGroups]
  );

  // ---------- ویرایش درجا (سریال، پارت‌نامبر، مشخصات فنی) — فقط ادمین ----------
  /** ذخیره‌ی یک فیلد با PATCH /field + به‌روزرسانی محلی فهرست */
  const saveField = async (partId: number, field: InlineField, newValue: string | null) => {
    await api.patch(`/parts/${partId}/field`, { field, value: newValue });
    setParts((prev) =>
      prev.map((x) => (x.id === partId ? { ...x, [field]: newValue ?? undefined } : x))
    );
  };

  const filtered = parts.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
    if (dupOnly && !dupPns.has(pn)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.part_number_1 || '').toLowerCase().includes(q) ||
      (p.part_serial_number || '').toLowerCase().includes(q) ||
      (p.project_name || '').toLowerCase().includes(q)
    );
  });

  if (loading)
    return <p className="text-stone-400 text-center mt-20 dark:text-stone-500">{t.loading}</p>;

  const statusCounts = {
    active: parts.filter((p) => p.status === 'active').length,
    replaced: parts.filter((p) => p.status === 'replaced').length,
    defective: parts.filter((p) => p.status === 'defective').length,
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto px-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔩</span>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">فهرست قطعات</h1>
          <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
            {toFa(parts.length)} قطعه
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={exportExcel}
            disabled={exporting || parts.length === 0}
            title="خروجی اکسل در قالب فهرست انبار — قابل بازخورد به ورود سریال"
          >
            {exporting ? '...' : '⬇ خروجی اکسل'}
          </button>
          {canWrite && (
            <Link to="/parts/new" className="btn-primary text-sm">
              {t.addPart}
            </Link>
          )}
        </div>
      </div>

      {catalogFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip chip-active">
            🧩 مرجع کاتالوگ: {catalogTitle || `#${catalogFilter}`}
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="btn-ghost !min-h-[30px] text-xs"
          >
            ✕ حذف فیلتر
          </button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <input
          className="input max-w-md"
          placeholder={t.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* جست‌وجوی فوری سریال — نتیجه‌ی آنی از سرور */}
        <div className="relative">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">#</span>
          <input
            className="input !pr-9 !w-[240px] fa-nums"
            placeholder="جست‌وجوی فوری سریال…"
            value={serialSearch}
            onChange={(e) => setSerialSearch(e.target.value)}
            dir="ltr"
          />
          {serialBusy && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {/* چایپ‌های فیلتر وضعیت — Ember Studio */}
        <div className="flex gap-2 flex-wrap">
          {([
            ['', 'همه', parts.length],
            ['active', 'فعال', statusCounts.active],
            ['replaced', 'تعویض‌شده', statusCounts.replaced],
            ['defective', 'معیوب', statusCounts.defective],
          ] as [string, string, number][]).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={
                statusFilter === value
                  ? 'chip chip-active cursor-pointer'
                  : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'
              }
            >
              {label} <span className="fa-nums opacity-70">({toFa(count)})</span>
            </button>
          ))}
        </div>
        {dupPns.size > 0 && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dupOnly}
              onChange={(e) => setDupOnly(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="chip bg-gold/15 text-[#8a6d00] dark:text-gold-light border border-gold/40">
              فقط تکراری‌ها ({toFa(dupPns.size)})
            </span>
          </label>
        )}
      </div>

      {pageError && <Alert variant="danger" className="mb-3">{pageError}</Alert>}

      {dupPns.size > 0 && !dupOnly && (
        <Alert variant="warning">
          {toFa(dupPns.size)} پارت‌نامبر با بیش از یک رکورد یافت شد — با فیلتر «فقط تکراری‌ها» بررسی و
          توضیح درست را انتخاب کنید.
        </Alert>
      )}

      {serialSearch.trim() && (
        <div className="rounded-2xl bg-brand-50/60 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 px-4 py-3 text-sm">
          <b className="fa-nums" dir="ltr">{serialSearch.trim()}</b>
          {' — '}
          {serialBusy ? 'در حال جست‌وجو…' : serialHits?.length ? `${toFa(serialHits.length)} قطعه با این سریال پیدا شد:` : 'هیچ قطعه‌ای با این سریال پیدا نشد.'}
          {serialHits?.length ? (
            <div className="mt-2 space-y-1">
              {serialHits.map((h) => (
                <Link key={h.id} to={`/parts/${h.id}`} className="flex items-center gap-3 text-sm hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg px-2 py-1.5 transition-colors">
                  <span className="font-medium" dir="auto">{h.title}</span>
                  <span className="fa-nums text-stone-500 dark:text-stone-400" dir="ltr">{h.part_serial_number}</span>
                  <span className="text-xs text-stone-500 dark:text-stone-400" dir="auto">{h.project_name}</span>
                  <span className="fa-nums text-xs text-stone-500 dark:text-stone-400" dir="ltr">{h.device_serial}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {filtered.length === 0 && !(serialSearch.trim()) ? (
        <p className="text-stone-400 dark:text-stone-500 text-center py-12">{t.noData}</p>
      ) : !serialSearch.trim() ? (
        <div className="overflow-x-auto card !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200 border-b-2 border-dashed border-brand-100 dark:border-brand-800">
                <th className="text-right px-3 py-3 font-bold">{t.partTitle}</th>
                <th className="text-right px-3 py-3 font-bold">{t.partNumber1}</th>
                <th className="text-right px-3 py-3 font-bold">{t.partSerial}</th>
                <th className="text-right px-3 py-3 font-bold">مشخصات فنی</th>
                <th className="text-right px-3 py-3 font-bold">پروژه</th>
                <th className="text-right px-3 py-3 font-bold">دستگاه</th>
                <th className="text-right px-3 py-3 font-bold">{t.status}</th>
                <th className="text-right px-3 py-3 font-bold">تاریخ فروش</th>
                {canWrite && dupPns.size > 0 && <th className="text-right px-3 py-3 font-bold"> </th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
                const isDup = dupPns.has(pn);
                const multiDesc = isDup && pnGroups.get(pn)!.some((x) => x.tech_specs && x.tech_specs !== p.tech_specs);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-dashed border-stone-100 dark:border-stone-700 hover:bg-brand-50/60 dark:hover:bg-brand-900/25 transition-colors ${
                      isDup ? 'bg-gold/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/parts/${p.id}`}
                        className="text-brand-600 dark:text-brand-300 hover:underline font-bold"
                      >
                        {p.title}
                      </Link>
                      {isDup && (
                        <span
                          className="badge bg-coral/10 text-coral-dark border border-coral/40 mr-2 dark:text-coral-light"
                          title="پارت‌نامبر تکراری"
                        >
                          تکراری
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">
                      {canWrite ? (
                        <InlineEditCell
                          value={p.part_number_1}
                          onSave={(v) => saveField(p.id, 'part_number_1', v)}
                          numeric
                          placeholder="پارت‌نامبر…"
                        />
                      ) : (
                        <span className="text-stone-700 dark:text-stone-200">{p.part_number_1 || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">
                      {canWrite ? (
                        <div className="flex items-center gap-1.5">
                          <InlineEditCell
                            value={p.part_serial_number}
                            onSave={(v) => saveField(p.id, 'part_serial_number', v)}
                            numeric
                            placeholder="سریال قطعه…"
                          />
                          {dupSerialIds.has(p.id) && p.part_serial_number && (
                            <button
                              type="button"
                              onClick={() => openSerialOwner(p.part_serial_number!)}
                              title="این سریال تکراری است — مشاهده‌ی قطعه‌ی صاحب سریال"
                              className="shrink-0 badge bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 cursor-pointer"
                            >
                              تکراری ⚠
                            </button>
                          )}
                        </div>
                      ) : dupSerialIds.has(p.id) && p.part_serial_number ? (
                        <button
                          type="button"
                          onClick={() => openSerialOwner(p.part_serial_number!)}
                          title="این سریال تکراری است — مشاهده‌ی قطعه‌ی صاحب سریال"
                          className="badge bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 cursor-pointer"
                        >
                          {p.part_serial_number} ⚠
                        </button>
                      ) : (
                        <span>{p.part_serial_number || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      {canWrite ? (
                        <div className="flex items-center gap-1">
                          <InlineEditCell
                            value={p.tech_specs}
                            onSave={(v) => saveField(p.id, 'tech_specs', v)}
                            multiline
                            widthClass="w-[200px]"
                            placeholder="مشخصات فنی…"
                          />
                          {multiDesc && <span className="text-coral-dark dark:text-coral-light shrink-0">⚠</span>}
                        </div>
                      ) : (
                        <span className={multiDesc ? 'text-coral-dark dark:text-coral-light' : ''}>
                          {p.tech_specs || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.project_name || '—'}</td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">
                      {p.device_serial || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-400 dark:text-stone-500">
                      {formatJalaliLong(p.sold_at_jalali)}
                    </td>
                    {canWrite && dupPns.size > 0 && (
                      <td className="px-3 py-2">
                        {isDup && (
                          <button
                            onClick={() => setDescDialog({ pn, group: pnGroups.get(pn)! })}
                            className="btn-secondary !min-h-[32px] !px-3 text-xs"
                          >
                            انتخاب توضیح
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {ownerDialog && (
        <Modal open onClose={() => setOwnerDialog(null)} title={`صاحبان سریال — ${ownerDialog.serial}`}>
          <div className="space-y-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {toFa(ownerDialog.matches.length)} قطعه در سامانه با این سریال ثبت شده — هر سریال باید فقط یک بار باشد. یکی از قطعات غلط است؛ آن را باز کنید و سریالش را اصلاح کنید.
            </p>
            <div className="space-y-2">
              {ownerDialog.matches.map((m) => (
                <Link
                  key={m.id}
                  to={`/parts/${m.id}`}
                  onClick={() => setOwnerDialog(null)}
                  className="block border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2.5 text-sm hover:bg-brand-50/60 dark:hover:bg-brand-900/20 transition-colors"
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-medium" dir="auto">{m.title}</span>
                    <StatusBadge status={m.status as 'active' | 'replaced' | 'defective'} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-500 dark:text-stone-400">
                    <span className="fa-nums" dir="ltr">{m.part_serial_number}</span>
                    <span dir="auto">{m.project_name || '—'}</span>
                    <span className="fa-nums" dir="ltr">{m.device_serial || '—'}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setOwnerDialog(null)} className="btn-secondary">{t.cancel}</button>
            </div>
          </div>
        </Modal>
      )}

      {descDialog && (
        <DescDialog
          pn={descDialog.pn}
          group={descDialog.group}
          onClose={() => setDescDialog(null)}
          onSaved={() => {
            setDescDialog(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * دیالوگ کاتالوگ — مرجع واحد برای گروه پارت‌های هم‌پارت‌نامبر.
 * • توضیح درست را از بین نسخه‌های موجود انتخاب می‌کنید یا مستقیم ویرایش می‌کنید
 * • ذخیره = به‌روزرسانی مرجع کاتالوگ + یکسان‌سازی خودکار همه‌ی قطعات وصل
 *   (در پروژه‌ها و تجهیزات مختلف) — توضیحات غیریکسان عملاً منعقد می‌شود
 */
function DescDialog({
  pn,
  group,
  onClose,
  onSaved,
}: {
  pn: string;
  group: Part[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // توضیحات متمایز موجود در گروه
  const variants = useMemo(() => {
    const set = new Set<string>();
    for (const p of group) if (p.tech_specs?.trim()) set.add(p.tech_specs.trim());
    return [...set];
  }, [group]);

  const titles = useMemo(() => {
    const set = new Set<string>();
    for (const p of group) if (p.title?.trim()) set.add(p.title.trim());
    return [...set];
  }, [group]);

  const [choice, setChoice] = useState<string>(variants[0] ?? '');
  const [customMode, setCustomMode] = useState(false);
  const [customSpecs, setCustomSpecs] = useState('');
  const [title, setTitle] = useState<string>(titles[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncedInfo, setSyncedInfo] = useState('');

  const finalSpecs = customMode ? customSpecs : choice;

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      // ۱) اگر مرجع کاتالوگ موجود است ویرایشش می‌کنیم، وگرنه می‌سازیم
      const lookup = await api.get<{ id?: number } | null>(`/part-catalog/lookup?pn=${encodeURIComponent(pn)}`);
      let catalogId: number;
      if (lookup?.id) {
        catalogId = lookup.id;
      } else {
        const created = await api.post<{ id: number }>('/part-catalog', {
          part_number_1: pn,
          title: title || pn,
          tech_specs: finalSpecs || null,
        });
        catalogId = created.id;
      }
      // ۲) PUT مرجع = ویرایش + sync خودکار همه‌ی قطعات وصل (سمت سرور)
      const r = await api.put<{ synced: number }>(`/part-catalog/${catalogId}`, {
        title: title || undefined,
        tech_specs: finalSpecs || null,
      });
      // ۳) قطعاتی که هنوز بدون مرجع‌اند (مثلاً PN تازه اصلاح‌شده) را هم هم‌راستا می‌کنیم
      await api.post('/part-catalog/sync');
      setSyncedInfo(`همه‌ی ${toFa(r.synced)} قطعه‌ی این پارت‌نامبر یکسان شد.`);
      setTimeout(onSaved, 800);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="card max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b-2 border-dashed border-brand-100 dark:border-brand-800 pb-3">
          <span className="text-2xl">🧩</span>
          <h2 className="font-extrabold text-brand-800 dark:text-brand-100">
            مرجع قطعه — پارت‌نامبر <span dir="ltr">{pn}</span>
          </h2>
        </div>

        <p className="text-sm text-brand-600 dark:text-brand-300">
          {toFa(group.length)} رکورد در پروژه‌ها و تجهیزات مختلف با این پارت‌نامبر نصب شده‌اند.
          مشخصات مرجع را انتخاب/ویرایش کنید تا <b>همه‌ی رکوردها</b> یکسان شوند — سریال هر قطعه مستقل می‌ماند.
        </p>

        {/* عنوان مرجع */}
        <div>
          <label className="label">عنوان مرجع قطعه</label>
          {titles.length > 1 ? (
            <select className="input" value={title} onChange={(e) => setTitle(e.target.value)}>
              {titles.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
          )}
        </div>

        {/* مشخصات فنی */}
        <div>
          <label className="label">مشخصات فنی مرجع</label>
          <div className="space-y-2">
            {variants.map((v) => (
              <label
                key={v}
                className={`flex items-start gap-2 rounded-2xl border-2 px-3 py-2 text-sm cursor-pointer transition ${
                  !customMode && choice === v
                    ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/50'
                    : 'border-brand-100 hover:border-brand-300 dark:border-brand-800'
                }`}
              >
                <input
                  type="radio"
                  name="desc"
                  checked={!customMode && choice === v}
                  onChange={() => { setCustomMode(false); setChoice(v); }}
                  className="mt-1 accent-brand-500"
                />
                <span className="text-brand-800 dark:text-brand-100">{v}</span>
                <span className="text-xs text-stone-400 dark:text-stone-500 mr-auto shrink-0">
                  ({toFa(group.filter((p) => p.tech_specs?.trim() === v).length)} رکورد)
                </span>
              </label>
            ))}
            <label
              className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm cursor-pointer transition ${
                customMode ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/50' : 'border-brand-100 hover:border-brand-300 dark:border-brand-800'
              }`}
            >
              <input
                type="radio"
                name="desc"
                checked={customMode}
                onChange={() => setCustomMode(true)}
                className="accent-brand-500"
              />
              <span className="text-brand-800 dark:text-brand-100 shrink-0">متن جدید:</span>
              <input
                className="input !min-h-[32px] !py-1 text-sm flex-1"
                value={customMode ? customSpecs : ''}
                onFocus={() => setCustomMode(true)}
                onChange={(e) => setCustomSpecs(e.target.value)}
                placeholder="مشخصات فنی دلخواه…"
                dir="auto"
              />
            </label>
          </div>
        </div>

        {syncedInfo && (
          <Alert variant="success" className="text-sm">{syncedInfo}</Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">
            {t.cancel}
          </button>
          <button onClick={apply} disabled={busy || (!customMode && !choice) || (customMode && !customSpecs.trim())} className="btn-primary text-sm">
            {busy ? '...' : 'یکسان‌سازی همه'}
          </button>
        </div>
      </div>
    </div>
  );
}
