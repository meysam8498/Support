// ============================================================
// مدیریت کاتالوگ قطعات — ویرایش مراجع و ادغام تکراری‌ها
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • جست‌وجو در مراجع + شمارنده‌ی نصب‌شده‌ها
// • ویرایش کامل مرجع (پارت‌نامبر ۱ و ۲، عنوان، مشخصات، یادداشت) → sync خودکار همه‌ی قطعات وصل (سمت سرور)
// • ادغام چند مرجع (وقتی یک PN به دو شکل ثبت شده) — قطعات به مرجع اصلی منتقل
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';
import Modal from './Modal';
import InlineEditCell from './InlineEditCell';
import { useAuth } from '../context/AuthContext';
import { downloadAuthenticated } from '../lib/download';

interface ProjectOption { id: number; name: string }

interface ImportResultItem {
  pn: string;
  title: string;
  specs: string;
  pn2: string;
  status: 'created' | 'updated' | 'skipped';
  filled?: string[];
  reason?: string;
  duplicate?: boolean;
  existing: boolean;
  /** PN مشابه یک مرجع موجود = احتمال غلط تایپی — پیشنهاد ادغام */
  similarTo?: { id: number; part_number_1: string; title: string };
}

interface ImportResult {
  dryRun: boolean;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  created: { part_number_1: string; title: string }[];
  updated: { part_number_1: string; title: string; filled: string[] }[];
  skipped: { pn: string; reason: string }[];
  /** ردیف‌های قابل ویرایش در پیش‌نمایش — مقادیر نهایی اعمال‌شونده */
  items: ImportResultItem[];
  itemsTotal: number;
  itemsTruncated: boolean;
  /** تعداد ردیف‌هایی که به‌جای مرجع جدید در مرجع موجود ادغام شدند */
  mergedCount: number;
}

const IMPORT_STATUS_META: Record<'created' | 'updated' | 'skipped', { label: string; cls: string }> = {
  created: { label: 'مرجع جدید', cls: 'bg-success/10 text-success border-success/40' },
  updated: { label: 'به‌روزرسانی', cls: 'bg-sky/10 text-sky-dark dark:text-sky-light border-sky/40' },
  skipped: { label: 'بدون تغییر', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400 border-stone-200 dark:border-stone-600' },
};

/**
 * جدول پیش‌نمایش قابل ویرایش — هر ردیف: وضعیت + PN + عنوان/مشخصات/PN2 قابل ویرایش.
 * ویرایش‌ها در edits (کلید = PN) جمع و هنگام ثبت به‌صورت overrides به سرور می‌روند.
 * ردیف‌های با PN مشابه مرجع موجود (احتمال غلط تایپی) با بج هشدار + انتخاب «ادغام/جدید».
 */
function ImportEditableList({
  items,
  edits,
  onChange,
  onUndo,
  resolutions,
  onResolve,
}: {
  items: ImportResultItem[];
  edits: Record<string, { title?: string; specs?: string; pn2?: string }>;
  onChange: (pn: string, field: 'title' | 'specs' | 'pn2', value: string) => void;
  onUndo: (pn: string) => void;
  resolutions: Record<string, 'new' | { mergeInto: number }>;
  onResolve: (pn: string, r: 'new' | { mergeInto: number } | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto">
      {items.map((it, i) => {
        const meta = IMPORT_STATUS_META[it.status];
        const reso = resolutions[it.pn];
        const decided = !!reso;
        const editable = it.status !== 'skipped' || (!it.duplicate && (decided || !it.similarTo)); // ردیف تکراری فقط نمایش
        const edit = edits[it.pn] ?? {};
        const isEdited = Object.keys(edit).length > 0;
        const isSimilar = !!it.similarTo && !it.duplicate;
        return (
          <div
            key={`${it.pn}-${i}`}
            className={`rounded-lg border px-2.5 py-2 text-xs space-y-1.5 ${
              isSimilar && !decided
                ? 'border-coral/50 bg-coral/5'
                : isEdited || (isSimilar && decided)
                  ? 'border-gold/50 bg-gold/5'
                  : 'border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {isSimilar && !decided ? (
                <span className="badge bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40">⚠ PN مشابه</span>
              ) : (
                <span className={`badge border ${meta.cls}`}>{meta.label}</span>
              )}
              <span className="font-bold fa-nums" dir="ltr">{it.pn}</span>
              {it.existing && <span className="text-[10px] text-stone-400 dark:text-stone-500">(موجود)</span>}
              {it.filled && it.filled.length > 0 && (
                <span className="text-[10px] text-sky-dark dark:text-sky-light">اعمال: {it.filled.join('، ')}</span>
              )}
              {it.reason && <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">{it.reason}</span>}
              {isEdited && (
                <>
                  <span className="badge bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40">ویرایش‌شده</span>
                  <button
                    type="button"
                    onClick={() => onUndo(it.pn)}
                    className="text-[10px] text-stone-500 dark:text-stone-400 underline cursor-pointer"
                    title="حذف ویرایش‌های این ردیف و برگشت به مقادیر فایل"
                  >
                    ↩ بازگردانی
                  </button>
                </>
              )}
            </div>
            {isSimilar && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-stone-50 dark:bg-stone-800/60 px-2 py-1.5 border border-stone-200 dark:border-stone-700">
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  شبیه مرجع موجود <b dir="ltr" className="fa-nums">{it.similarTo!.part_number_1}</b>
                  {it.similarTo!.title ? ` — ${it.similarTo!.title}` : ''}:
                </span>
                <button
                  type="button"
                  onClick={() => onResolve(it.pn, { mergeInto: it.similarTo!.id })}
                  className={reso && typeof reso === 'object' ? 'chip chip-active cursor-pointer !text-[11px]' : 'chip chip-default cursor-pointer !text-[11px]'}
                >
                  ⧉ ادغام در {it.similarTo!.part_number_1}
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(it.pn, 'new')}
                  className={reso === 'new' ? 'chip chip-active cursor-pointer !text-[11px]' : 'chip chip-default cursor-pointer !text-[11px]'}
                >
                  ＋ مرجع جدید است
                </button>
                {decided && (
                  <button type="button" onClick={() => onResolve(it.pn, null)} className="text-[10px] text-stone-400 dark:text-stone-500 underline cursor-pointer">
                    لغو تصمیم
                  </button>
                )}
              </div>
            )}
            {editable && (it.status !== 'skipped' || decided) ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <input
                  className="input !min-h-0 !py-1 !text-[11px]"
                  value={edit.title ?? it.title}
                  onChange={(e) => onChange(it.pn, 'title', e.target.value)}
                  placeholder="عنوان…"
                  dir="auto"
                  title="عنوان مرجع — قابل ویرایش"
                />
                <input
                  className="input !min-h-0 !py-1 !text-[11px]"
                  value={edit.specs ?? it.specs}
                  onChange={(e) => onChange(it.pn, 'specs', e.target.value)}
                  placeholder="مشخصات…"
                  dir="auto"
                  title="مشخصات فنی — قابل ویرایش"
                />
                <input
                  className="input !min-h-0 !py-1 !text-[11px]"
                  value={edit.pn2 ?? it.pn2}
                  onChange={(e) => onChange(it.pn, 'pn2', e.target.value)}
                  placeholder="پارت‌نامبر ۲…"
                  dir="ltr"
                  title="پارت‌نامبر ۲ — قابل ویرایش"
                />
              </div>
            ) : (
              (it.title || it.specs) && (
                <p className="text-stone-500 dark:text-stone-400 truncate" dir="auto">
                  {it.title}{it.specs ? ` — ${it.specs}` : ''}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

interface CatalogRow {
  id: number;
  part_number_1: string;
  part_number_2: string | null;
  title: string;
  tech_specs: string | null;
  notes: string | null;
  installed_count: number;
}

export default function CatalogManager() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState({ part_number_1: '', part_number_2: '', title: '', tech_specs: '', notes: '' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  /** پیشنهاد ادغام هنگام برخورد PN در ویرایش — مرجع برخوردی + PN درخواستی */
  const [mergeSuggestion, setMergeSuggestion] = useState<{
    editingId: number;
    editingTitle: string;
    requestedPn: string;
    conflict: { id: number; part_number_1: string; title: string; tech_specs: string | null; installed_count: number };
  } | null>(null);

  // ---------- افزودن مرجع جدید (دستی) ----------
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ part_number_1: '', part_number_2: '', title: '', tech_specs: '', notes: '' });

  // ---------- آپدیت از اکسل / Paste ----------
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  /** تصمیم‌های کاربر برای PNهای برخوردی مشابه — کلید = PN؛ 'new' = ثبت جدید، {mergeInto} = ادغام */
  const [importResolutions, setImportResolutions] = useState<Record<string, 'new' | { mergeInto: number }>>({});
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  /** ویرایش‌های کاربر روی پیش‌نمایش — کلید = PN؛ هنگام ثبت به‌صورت overrides به سرور می‌رود */
  const [importEdits, setImportEdits] = useState<Record<string, { title?: string; specs?: string; pn2?: string }>>({});
  const importInputRef = useRef<HTMLInputElement>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  // دیالوگ خروجی فیلترشده — فیلتر پروژه/جست‌وجو به سرور می‌رود تا فقط مراجع منطبق صادر شوند
  const [showExport, setShowExport] = useState(false);
  const [exportQ, setExportQ] = useState('');
  const [exportProjectId, setExportProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  /** دانلود قالب اکسل آپدیت کاتالوگ — با توکن (لینک ساده ۴۰۱ می‌دهد) */
  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await downloadAuthenticated('/part-catalog/template', 'part-catalog-template.xlsx');
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setTemplateBusy(false);
    }
  };

  /** خروجی اکسل کاتالوگ — بدون فیلتر: همه؛ با فیلتر: فقط مراجع منطبق */
  const downloadExport = async (opts?: { q?: string; project_id?: string }) => {
    setExportBusy(true);
    try {
      const j = new Date().toLocaleDateString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' }).replace(/\//g, '-');
      const qs = new URLSearchParams();
      if (opts?.q?.trim()) qs.set('q', opts.q.trim());
      if (opts?.project_id) qs.set('project_id', opts.project_id);
      const suffix = qs.toString() ? '-filtered' : '';
      await downloadAuthenticated(`/part-catalog/export${qs.toString() ? `?${qs.toString()}` : ''}`, `part-catalog-export${suffix}-${j}.xlsx`);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  };

  /** باز کردن دیالوگ خروجی فیلترشده — فهرست پروژه‌ها یک بار می‌آید */
  const openExportDialog = () => {
    setExportQ(q);
    setExportProjectId('');
    setShowExport(true);
    if (projects.length === 0) {
      api.get<{ projects: ProjectOption[] }>('/lists').then((l) => setProjects(l.projects ?? [])).catch(() => setProjects([]));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.get<CatalogRow[]>(`/part-catalog?q=${encodeURIComponent(q)}`));
    } catch { /* */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const openEdit = (r: CatalogRow) => {
    setEditing(r);
    setForm({ part_number_1: r.part_number_1, part_number_2: r.part_number_2 || '', title: r.title, tech_specs: r.tech_specs || '', notes: r.notes || '' });
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    setBusy(true);
    try {
      const pnChanged = form.part_number_1.trim().toUpperCase() !== editing.part_number_1.toUpperCase();
      let confirmMsg = '';
      if (pnChanged) {
        confirmMsg = editing.installed_count > 0
          ? `پارت‌نامبر مرجع تغییر می‌کند و پارت‌نامبر ${toFa(editing.installed_count)} قطعه‌ی نصب‌شده هم با آن به‌روز می‌شود. ادامه؟`
          : 'پارت‌نامبر مرجع تغییر می‌کند. ادامه؟';
        if (!confirm(confirmMsg)) { setBusy(false); return; }
      }
      const r = await api.put<{ synced: number }>(`/part-catalog/${editing.id}`, {
        part_number_1: form.part_number_1.trim(),
        part_number_2: form.part_number_2.trim() || null,
        title: form.title.trim() || undefined,
        tech_specs: form.tech_specs.trim() || null,
        notes: form.notes.trim() || null,
      });
      setMsg(`مرجع ذخیره و ${toFa(r.synced)} قطعه‌ی نصب‌شده یکسان شد${pnChanged ? ' (شامل پارت‌نامبر)' : ''}.`);
      setEditing(null);
      await load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      // برخورد PN با مرجع دیگر؟ → پیشنهاد «ادغام» به‌جای خطا
      const err = e as Error & { payload?: { conflict?: { id: number; part_number_1: string; title: string; tech_specs: string | null; installed_count: number } } };
      const conflict = err.payload?.conflict;
      if (conflict && editing) {
        setMergeSuggestion({
          editingId: editing.id,
          editingTitle: editing.title,
          requestedPn: form.part_number_1.trim().toUpperCase(),
          conflict,
        });
      } else {
        alert((e as Error).message);
      }
    } finally { setBusy(false); }
  };

  /** پذیرش پیشنهاد: ادغام مرجعِ در حال ویرایش (source) در مرجع برخوردی (keep) + هم‌راستاسازی */
  const acceptMergeSuggestion = async () => {
    if (!mergeSuggestion) return;
    const { editingId, conflict } = mergeSuggestion;
    setBusy(true);
    try {
      const r = await api.post<{ synced: number }>('/part-catalog/merge', { keep_id: conflict.id, merge_ids: [editingId] });
      // sync قطعات جدید فقط در صورت خالی‌بودن فیلدهایشان انجام شده؛ عنوان مرجع نگه‌داشته می‌شود
      setMsg(`ادغام انجام شد — مرجع «${mergeSuggestion.editingTitle}» حذف و قطعاتش به «${conflict.title}» منتقل شد (${toFa(r.synced)} قطعه وصل است).`);
      setMergeSuggestion(null);
      setEditing(null);
      await load();
      setTimeout(() => setMsg(''), 6000);
    } catch (e) {
      alert((e as Error).message);
    } finally { setBusy(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  /** ویرایش درجای پارت‌نامبر ۲ مرجع — sync خودکار قطعات وصل سمت سرور */
  const savePn2 = async (row: CatalogRow, newValue: string | null): Promise<void> => {
    await api.put(`/part-catalog/${row.id}`, { part_number_2: newValue });
    await load();
  };

  const merge = async () => {
    if (selected.size < 2) return;
    // مرجع با بیشترین نصب‌شده پیشنهاد می‌شود به‌عنوان «حرف آخر»
    const ids = [...selected];
    const keep = ids.reduce((best, id) => {
      const a = rows.find((r) => r.id === id)!;
      const b = rows.find((r) => r.id === best)!;
      return a.installed_count > b.installed_count ? id : best;
    }, ids[0]);
    const mergeIds = ids.filter((i) => i !== keep);
    const keepRow = rows.find((r) => r.id === keep)!;
    if (!confirm(`ادغام ${toFa(mergeIds.length)} مرجع در «${keepRow.title} (${keepRow.part_number_1})»؟ قطعات وصل به همه به این مرجع منتقل می‌شوند.`)) return;
    setBusy(true);
    try {
      const r = await api.post<{ synced: number }>('/part-catalog/merge', { keep_id: keep, merge_ids: mergeIds });
      setMsg(`ادغام شد — ${toFa(r.synced)} قطعه حالا به یک مرجع وصل‌اند.`);
      setSelected(new Set());
      await load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      alert((e as Error).message);
    } finally { setBusy(false); }
  };

  const totalInstalled = useMemo(() => rows.reduce((s, r) => s + r.installed_count, 0), [rows]);

  // ---------- افزودن مرجع جدید (دستی) ----------
  const submitAdd = async () => {
    setBusy(true);
    try {
      await api.post<{ id: number }>('/part-catalog', {
        part_number_1: addForm.part_number_1.trim(),
        part_number_2: addForm.part_number_2.trim() || null,
        title: addForm.title.trim(),
        tech_specs: addForm.tech_specs.trim() || null,
        notes: addForm.notes.trim() || null,
      });
      setMsg(`مرجع «${addForm.title.trim() || addForm.part_number_1.trim()}» ساخته شد.`);
      setShowAdd(false);
      setAddForm({ part_number_1: '', part_number_2: '', title: '', tech_specs: '', notes: '' });
      await load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      alert((e as Error).message);
    } finally { setBusy(false); }
  };

  // ---------- آپدیت از اکسل / Paste ----------
  const runCatalogImport = async (dryRun: boolean) => {
    setImportError('');
    if (dryRun) setImportResult(null); setImportResolutions({});
    setBusy(true);
    try {
      let result: ImportResult;
      if (importMode === 'paste') {
        if (!importText.trim()) throw new Error('لیست را از اکسل کپی و اینجا بچسبانید.');
        const res = await api.post<{ result: ImportResult }>('/part-catalog/import-text', {
          text: importText,
          dry_run: dryRun,
          ...(dryRun ? {} : { overrides: importEdits, resolutions: importResolutions }),
        });
        result = res.result;
      } else {
        if (!importFile) throw new Error('فایل اکسل را انتخاب کنید.');
        const fd = new FormData();
        fd.append('file', importFile);
        const token = localStorage.getItem('token');
        const res = await fetch('/api/part-catalog/import', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(dryRun
              ? { 'X-Dry-Run': '1' }
              : { 'X-Overrides': JSON.stringify(importEdits), 'X-Resolutions': JSON.stringify(importResolutions) }),
          },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
        result = data.result as ImportResult;
      }
      setImportResult(result);
      if (!dryRun) {
        const editedCount = Object.keys(importEdits).length;
        const mergedCount = result.mergedCount ?? 0;
        setMsg(
          `کاتالوگ به‌روز شد — ${toFa(result.createdCount)} جدید، ${toFa(result.updatedCount)} به‌روزرسانی، ${toFa(result.skippedCount)} بدون تغییر` +
            (mergedCount > 0 ? ` — ${toFa(mergedCount)} ردیف در مراجع موجود ادغام شد` : '') +
            (editedCount > 0 ? ` (${toFa(editedCount)} ویرایش دستی اعمال شد).` : '.'),
        );
        setImportText('');
        setImportFile(null);
        if (importInputRef.current) importInputRef.current.value = '';
        setImportEdits({});
        setImportResolutions({});
        setShowImport(false);
        await load();
        setTimeout(() => setMsg(''), 6000);
      }
    } catch (e) {
      setImportError((e as Error).message);
    } finally { setBusy(false); }
  };

  /** بازگردانی یک ردیف ویرایش‌شده به مقادیر فایل (undo ویرایش) */
  const onEditUndo = (pn: string) => {
    setImportEdits((s) => {
      const next = { ...s };
      delete next[pn];
      return next;
    });
  };

  /** تصمیم ادغام/جدید برای PN برخوردی مشابه */
  const onResolve = (pn: string, r: 'new' | { mergeInto: number } | null) => {
    setImportResolutions((s) => {
      const next = { ...s };
      if (r === null) delete next[pn];
      else next[pn] = r;
      return next;
    });
  };

  /** تغییر یک فیلد در پیش‌نمایش — فیلد حاضر ولی خالی = «این مقدار اعمال نشود» */
  const onEditChange = (pn: string, field: 'title' | 'specs' | 'pn2', value: string) => {
    setImportEdits((s) => {
      const cur = s[pn] ?? {};
      return { ...s, [pn]: { ...cur, [field]: value } };
    });
  };

  return (
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">🔍</span>
          <input
            className="input !pr-10"
            placeholder="جست‌وجو در عنوان، پارت‌نامبر ۱ و ۲…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            dir="auto"
          />
        </div>
        <span className="chip chip-default fa-nums">{toFa(rows.length)} مرجع · {toFa(totalInstalled)} نصب‌شده</span>
        {isAdmin && (
          <>
            <button
              onClick={() => setShowAdd(true)}
              className="btn-primary text-xs !min-h-[34px]"
            >
              ＋ مرجع جدید
            </button>
            <button
              onClick={() => { setShowImport(true); setImportResult(null); setImportResolutions({}); setImportError(''); setImportEdits({}); }}
              className="btn-secondary text-xs !min-h-[34px]"
              title="آپدیت گروهی کاتالوگ از فایل اکسل یا چسباندن لیست — بدون حذف هیچ رکوردی"
            >
              📥 آپدیت از اکسل / Paste
            </button>
            <button
              onClick={openExportDialog}
              disabled={exportBusy}
              className="btn-secondary text-xs !min-h-[34px]"
              title="صادرکردن مراجع (همه یا فیلترشده با جست‌وجو/پروژه) با همان قالب import — ویرایش در اکسل و بازبارگذاری مستقیم"
            >
              {exportBusy ? '...' : '📤 خروجی اکسل کاتالوگ'}
            </button>
          </>
        )}
        <button
          onClick={merge}
          disabled={selected.size < 2 || busy}
          className="btn-secondary text-xs !min-h-[34px]"
          title="ادغام مراجع انتخاب‌شده — قطعات همه به مرجع پرنصب‌تر منتقل می‌شوند"
        >
          ⧉ ادغام ({toFa(selected.size)})
        </button>
      </div>

      {msg && (
        <p className="p-3 bg-green-50 dark:bg-green-900/25 text-success dark:text-green-300 rounded-lg text-sm border border-green-200 dark:border-green-800">
          {msg}
        </p>
      )}

      {/* جدول مراجع */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">{t.loading}</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">
            {q ? 'مرجعی یافت نشد.' : 'کاتالوگ خالی است — با ثبت قطعه یا import اکسل خودکار پر می‌شود.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-raised dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                  <th className="w-10 px-3 py-2.5"></th>
                  <th className="text-right px-3 py-2.5 font-semibold">پارت‌نامبر</th>
                  <th className="text-right px-3 py-2.5 font-semibold">پارت‌نامبر ۲</th>
                  <th className="text-right px-3 py-2.5 font-semibold">عنوان مرجع</th>
                  <th className="text-right px-3 py-2.5 font-semibold">مشخصات فنی</th>
                  <th className="text-center px-3 py-2.5 font-semibold">نصب‌شده</th>
                  <th className="text-right px-3 py-2.5 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-dashed border-stone-200 dark:border-stone-700 transition-colors ${
                      selected.has(r.id) ? 'bg-brand-50/70 dark:bg-brand-900/25' : 'hover:bg-brand-50/40 dark:hover:bg-brand-900/15'
                    }`}
                  >
                    <td className="px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-4 h-4 accent-brand-500"
                        title="انتخاب برای ادغام"
                      />
                    </td>
                    <td className="px-3 py-2 fa-nums text-stone-700 dark:text-stone-200" dir="ltr">{r.part_number_1}</td>
                    <td className="px-3 py-2 fa-nums text-stone-600 dark:text-stone-300" dir="ltr">
                      {isAdmin ? (
                        <InlineEditCell
                          value={r.part_number_2}
                          onSave={(v) => savePn2(r, v)}
                          numeric
                          widthClass="w-[120px]"
                          placeholder="پارت‌نامبر ۲…"
                        />
                      ) : (
                        <span>{r.part_number_2 || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-stone-800 dark:text-stone-100" dir="auto">{r.title}</td>
                    <td className="px-3 py-2 text-xs text-stone-600 dark:text-stone-300 max-w-[280px]" dir="auto">
                      {r.tech_specs || '—'}
                      {r.notes && <span className="block text-[10px] text-gold-dark dark:text-gold-light mt-0.5" title={r.notes}>⚠ یادداشت</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.installed_count > 0 ? (
                        <Link
                          to={`/parts?catalog=${r.id}`}
                          title="مشاهده‌ی قطعات نصب‌شده‌ی این مرجع"
                          className="badge bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50 fa-nums transition-colors"
                        >
                          {toFa(r.installed_count)} 🔗
                        </Link>
                      ) : (
                        <span className="badge bg-stone-100 text-stone-400 dark:bg-stone-700 dark:text-stone-500 fa-nums">۰</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => openEdit(r)} className="text-brand-600 hover:underline text-xs dark:text-brand-400">{t.edit}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* دیالوگ افزودن مرجع جدید */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="افزودن مرجع کاتالوگ">
        <div className="space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            مرجع یکتا برای یک مدل قطعه — بعد از این، قطعات هم‌پارت‌نامبر جدید به‌طور خودکار همین اطلاعات را می‌گیرند.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">پارت‌نامبر ۱ (کلید مرجع) <span className="text-coral">*</span></label>
              <input className="input" value={addForm.part_number_1} onChange={(e) => setAddForm({ ...addForm, part_number_1: e.target.value })} dir="ltr" placeholder="مثل 840758-001" />
            </div>
            <div>
              <label className="label">پارت‌نامبر ۲ (اختیاری)</label>
              <input className="input" value={addForm.part_number_2} onChange={(e) => setAddForm({ ...addForm, part_number_2: e.target.value })} dir="ltr" />
            </div>
          </div>
          <div>
            <label className="label">عنوان مرجع <span className="text-coral">*</span></label>
            <input className="input" value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} dir="auto" placeholder="مثل 32GB DDR4 RDIMM" />
          </div>
          <div>
            <label className="label">مشخصات فنی</label>
            <textarea className="input" rows={2} value={addForm.tech_specs} onChange={(e) => setAddForm({ ...addForm, tech_specs: e.target.value })} dir="auto" />
          </div>
          <div>
            <label className="label">یادداشت داخلی</label>
            <input className="input" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} dir="auto" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={submitAdd} disabled={busy || !addForm.title.trim() || !addForm.part_number_1.trim()} className="btn-primary">{busy ? '...' : t.save}</button>
          </div>
        </div>
      </Modal>

      {/* دیالوگ آپدیت از اکسل / Paste */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="آپدیت کاتالوگ از اکسل / Paste">
        <div className="space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-5">
            دو قالب پذیرفته می‌شود: <b>ردیف‌محور</b> — سرستون «پارت‌نامبر» + عنوان قطعه + مشخصات فنی (+ پارت‌نامبر ۲ اختیاری)، یا <b>فهرست انبار</b> —
            ردیف ۱ عنوان، ردیف ۲ توضیح، ردیف ۳ پارت‌نامبر. رفتار: مرجع جدید ساخته می‌شود و مرجع موجود فقط در فیلدهایی که فایل پر کرده به‌روز می‌شود —
            <b>هیچ رکوردی حذف نمی‌شود</b>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setImportMode('file')} className={!importMode || importMode === 'file' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}>📄 فایل اکسل</button>
            <button type="button" onClick={() => setImportMode('paste')} className={importMode === 'paste' ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer'}>📋 چسباندن لیست</button>
          </div>
          <p className="text-[11px] text-brand-600 dark:text-brand-300">
            {'→ '}
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={templateBusy}
              className="underline font-bold cursor-pointer"
            >
              {templateBusy ? '...' : 'دانلود قالب اکسل آپدیت کاتالوگ'}
            </button>
            {' — فایل نمونه با شیت راهنما؛ پرشده‌اش را در همین دیالوگ بارگذاری کنید. | '}
            <button
              type="button"
              onClick={() => downloadExport()}
              disabled={exportBusy}
              className="underline font-bold cursor-pointer"
              title="مراجع فعلی کاتالوگ با همان قالب ردیف‌های قابل ویرایش صادر می‌شوند — ویرایش در اکسل و بازبارگذاری در همین دیالوگ"
            >
              {exportBusy ? '...' : '📥 دانلود با داده‌های موجود'}
            </button>
            {' — همه‌ی مراجع فعلی به‌صورت ردیف‌های قابل ویرایش با همین قالب؛ ویرایشش کنید و مستقیم بازبارگذاری کنید (چرخه‌ی کامل دوطرفه).'}
          </p>
          {importMode === 'paste' ? (
            <textarea
              className="input font-mono text-xs"
              rows={7}
              dir="ltr"
              placeholder={'پارت‌نامبر\tعنوان قطعه\tمشخصات فنی\tپارت‌نامبر ۲\n840758-001\t32GB DDR4\tPC4-2666\t840758-B21\nP19776-B21\tPSU 800W\t800W Platinum'}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportResult(null); setImportResolutions({}); }}
            />
          ) : (
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="input" onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); setImportResolutions({}); }} />
          )}
          {importError && <p className="p-2 bg-coral/10 text-coral-dark rounded-lg text-xs border border-coral/30 dark:text-coral-light">{importError}</p>}
          {importResult && (
            <div className="rounded-xl bg-surface-card dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 p-3 space-y-2">
              <p className="text-xs font-bold text-brand-700 dark:text-brand-300">
                {importResult.dryRun ? '🔍 پیش‌نمایش — هیچ تغییری ذخیره نشده؛ عنوان/مشخصات هر ردیف را ویرایش کنید:' : 'نتیجه:'}{' '}
                {importResult.dryRun && Object.keys(importEdits).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setImportEdits({})}
                    className="text-[11px] text-stone-500 dark:text-stone-400 underline cursor-pointer"
                    title="حذف همه‌ی ویرایش‌های دستی و برگشت همه‌ی ردیف‌ها به مقادیر فایل"
                  >
                    ↩ بازگردانی همه به مقادیر فایل
                  </button>
                )}
                {toFa(importResult.createdCount)} جدید · {toFa(importResult.updatedCount)} به‌روزرسانی · {toFa(importResult.skippedCount)} بدون تغییر
                {importResult.itemsTruncated ? ' (نمایش اولین ۲۰۰ ردیف)' : ''}
              </p>
              {importResult.dryRun ? (
                <ImportEditableList items={importResult.items} edits={importEdits} onChange={onEditChange} onUndo={onEditUndo} resolutions={importResolutions} onResolve={onResolve} />
              ) : (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {toFa(Object.keys(importEdits).length)} ویرایش دستی همراه ثبت اعمال شد.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowImport(false)} className="btn-secondary">{t.cancel}</button>
            <button
              onClick={() => runCatalogImport(true)}
              disabled={busy || (importMode === 'paste' ? !importText.trim() : !importFile)}
              className="btn-secondary"
            >
              {busy ? '...' : '🔍 پیش‌نمایش'}
            </button>
            <button
              onClick={() => runCatalogImport(false)}
              disabled={busy || (importMode === 'paste' ? !importText.trim() : !importFile)}
              className="btn-primary"
            >
              {busy ? '...' : 'ثبت تغییرات'}
            </button>
          </div>
        </div>
      </Modal>

      {/* دیالوگ پیشنهاد ادغام هنگام برخورد PN */}
      <Modal open={!!mergeSuggestion} onClose={() => setMergeSuggestion(null)} title="پارت‌نامبر تکراری — پیشنهاد ادغام">
        {mergeSuggestion && (
          <div className="space-y-4">
            <p className="text-sm text-stone-700 dark:text-stone-200 leading-6">
              پارت‌نامبر <b className="fa-nums" dir="ltr">{mergeSuggestion.requestedPn}</b> هم‌اکنون به مرجع دیگری تعلق دارد؛
              پس نمی‌توان همین‌جا تغییرش داد. می‌توانید <b>مرجع فعلی</b> را در آن <b>ادغام</b> کنید تا همه‌ی قطعاتش منتقل شوند:
            </p>
            <div className="rounded-xl border-2 border-gold/40 bg-gold/5 p-3 text-sm space-y-1">
              <p className="font-bold text-[#8a6d00] dark:text-gold-light">مرجع نگه‌داشتنی (مقصد):</p>
              <p>
                <b dir="auto">{mergeSuggestion.conflict.title}</b>{' '}
                <span className="fa-nums text-stone-500 dark:text-stone-400" dir="ltr">({mergeSuggestion.conflict.part_number_1})</span>
              </p>
              {mergeSuggestion.conflict.tech_specs && (
                <p className="text-xs text-stone-600 dark:text-stone-300" dir="auto">{mergeSuggestion.conflict.tech_specs}</p>
              )}
              <p className="text-xs fa-nums text-stone-600 dark:text-stone-300">
                نصب‌شده: {toFa(mergeSuggestion.conflict.installed_count)} قطعه
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 text-sm space-y-1">
              <p className="font-bold text-stone-700 dark:text-stone-200">مرجع ادغام‌شونده (حذف می‌شود):</p>
              <p dir="auto">{mergeSuggestion.editingTitle}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                قطعات نصب‌شده‌ی آن به مقصد منتقل و با اطلاعات مقصد هم‌راستا می‌شوند؛ این مرجع حذف خواهد شد.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => setMergeSuggestion(null)} className="btn-secondary">انصراف و ویرایش دستی PN</button>
              <button onClick={acceptMergeSuggestion} disabled={busy} className="btn-primary">
                {busy ? '...' : `⧉ ادغام در «${mergeSuggestion.conflict.title}»`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* دیالوگ خروجی کاتالوگ با فیلتر اختیاری */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="خروجی اکسل کاتالوگ">
        <div className="space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-5">
            خروجی با همان قالب import — بدون فیلتر همه‌ی مراجع صادر می‌شوند؛ با فیلتر فقط مراجع منطبق
            (جست‌وجو در عنوان/پارت‌نامبر، یا مراجع دارای قطعه‌ی نصب‌شده در پروژه‌ی انتخابی).
          </p>
          <div className="space-y-2 rounded-xl border border-stone-200 dark:border-stone-700 p-3">
            <p className="text-[11px] font-bold text-stone-600 dark:text-stone-300">فیلتر اختیاری:</p>
            <input
              className="input !min-h-0 !py-1.5 !text-xs"
              placeholder="جست‌وجو در عنوان و پارت‌نامبر‌ها…"
              value={exportQ}
              onChange={(e) => setExportQ(e.target.value)}
              dir="auto"
            />
            <select
              className="input !min-h-0 !py-1.5 !text-xs"
              value={exportProjectId}
              onChange={(e) => setExportProjectId(e.target.value)}
            >
              <option value="">همه‌ی پروژه‌ها</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowExport(false)} className="btn-secondary">{t.cancel}</button>
            <button
              onClick={async () => {
                await downloadExport({ q: exportQ, project_id: exportProjectId });
                setShowExport(false);
              }}
              disabled={exportBusy}
              className="btn-primary"
            >
              {exportBusy ? '...' : '⬇ دانلود اکسل'}
            </button>
          </div>
        </div>
      </Modal>

      {/* دیالوگ ویرایش مرجع */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`ویرایش مرجع — ${editing?.title ?? ''}`}>
        <div className="space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            این همان «اطلاعات کامل قطعه» است — ذخیره‌ی آن، <b>همه‌ی قطعات نصب‌شده</b> را (پارت‌نامبر، عنوان و توضیح) خودکار یکسان می‌کند؛ فقط سریال هر نمونه مستقل می‌ماند.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">پارت‌نامبر ۱ (کلید مرجع)</label>
              <input className="input" value={form.part_number_1} onChange={(e) => setForm({ ...form, part_number_1: e.target.value })} dir="ltr" />
            </div>
            <div>
              <label className="label">پارت‌نامبر ۲ (اختیاری)</label>
              <input className="input" value={form.part_number_2} onChange={(e) => setForm({ ...form, part_number_2: e.target.value })} dir="ltr" />
            </div>
          </div>
          <div>
            <label className="label">عنوان مرجع</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" />
          </div>
          <div>
            <label className="label">مشخصات فنی مرجع</label>
            <textarea className="input" rows={3} value={form.tech_specs} onChange={(e) => setForm({ ...form, tech_specs: e.target.value })} dir="auto" />
          </div>
          <div>
            <label className="label">یادداشت داخلی</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="auto" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)} className="btn-secondary">{t.cancel}</button>
            <button onClick={saveEdit} disabled={busy || !form.title.trim() || !form.part_number_1.trim()} className="btn-primary">{busy ? '...' : t.save}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
