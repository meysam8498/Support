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

interface ImportResult {
  dryRun: boolean;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  created: { part_number_1: string; title: string }[];
  updated: { part_number_1: string; title: string; filled: string[] }[];
  skipped: { pn: string; reason: string }[];
}

const IMPORT_STATUS_META: Record<'created' | 'updated' | 'skipped', { label: string; cls: string }> = {
  created: { label: 'مرجع جدید', cls: 'bg-success/10 text-success border-success/40' },
  updated: { label: 'به‌روزرسانی', cls: 'bg-sky/10 text-sky-dark dark:text-sky-light border-sky/40' },
  skipped: { label: 'بدون تغییر', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400 border-stone-200 dark:border-stone-600' },
};

function ImportResultList({ result }: { result: ImportResult }) {
  const any = result.createdCount + result.updatedCount + result.skippedCount;
  if (any === 0) return null;
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto">
      {[...result.created.map((c) => ({ ...c, st: 'created' as const, filled: [] as string[] })),
        ...result.updated.map((u) => ({ ...u, st: 'updated' as const })),
        ...result.skipped.map((s) => ({ part_number_1: s.pn, title: s.reason, st: 'skipped' as const, filled: [] as string[] }))]
        .map((it, i) => {
          const meta = IMPORT_STATUS_META[it.st];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 py-1.5">
              <span className={`badge border ${meta.cls}`}>{meta.label}</span>
              <span className="font-bold fa-nums" dir="ltr">{it.part_number_1}</span>
              {it.title && <span className="text-stone-600 dark:text-stone-300 truncate" dir="auto">{it.title}</span>}
              {it.filled.length > 0 && <span className="text-[10px] text-stone-400 dark:text-stone-500">({it.filled.join('، ')})</span>}
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

  // ---------- افزودن مرجع جدید (دستی) ----------
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ part_number_1: '', part_number_2: '', title: '', tech_specs: '', notes: '' });

  // ---------- آپدیت از اکسل / Paste ----------
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const saveEdit = async () => {
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
    setImportResult(null);
    setBusy(true);
    try {
      let result: ImportResult;
      if (importMode === 'paste') {
        if (!importText.trim()) throw new Error('لیست را از اکسل کپی و اینجا بچسبانید.');
        const res = await api.post<{ result: ImportResult }>('/part-catalog/import-text', { text: importText, dry_run: dryRun });
        result = res.result;
      } else {
        if (!importFile) throw new Error('فایل اکسل را انتخاب کنید.');
        const fd = new FormData();
        fd.append('file', importFile);
        const token = localStorage.getItem('token');
        const res = await fetch('/api/part-catalog/import', {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(dryRun ? { 'X-Dry-Run': '1' } : {}) },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
        result = data.result as ImportResult;
      }
      setImportResult(result);
      if (!dryRun) {
        setMsg(`کاتالوگ به‌روز شد — ${toFa(result.createdCount)} جدید، ${toFa(result.updatedCount)} به‌روزرسانی، ${toFa(result.skippedCount)} بدون تغییر.`);
        setImportText('');
        setImportFile(null);
        if (importInputRef.current) importInputRef.current.value = '';
        setShowImport(false);
        await load();
        setTimeout(() => setMsg(''), 6000);
      }
    } catch (e) {
      setImportError((e as Error).message);
    } finally { setBusy(false); }
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
              onClick={() => { setShowImport(true); setImportResult(null); setImportError(''); }}
              className="btn-secondary text-xs !min-h-[34px]"
              title="آپدیت گروهی کاتالوگ از فایل اکسل یا چسباندن لیست — بدون حذف هیچ رکوردی"
            >
              📥 آپدیت از اکسل / Paste
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
          {importMode === 'paste' ? (
            <textarea
              className="input font-mono text-xs"
              rows={7}
              dir="ltr"
              placeholder={'پارت‌نامبر\tعنوان قطعه\tمشخصات فنی\tپارت‌نامبر ۲\n840758-001\t32GB DDR4\tPC4-2666\t840758-B21\nP19776-B21\tPSU 800W\t800W Platinum'}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportResult(null); }}
            />
          ) : (
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="input" onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }} />
          )}
          {importError && <p className="p-2 bg-coral/10 text-coral-dark rounded-lg text-xs border border-coral/30 dark:text-coral-light">{importError}</p>}
          {importResult && (
            <div className="rounded-xl bg-surface-card dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 p-3 space-y-2">
              <p className="text-xs font-bold text-brand-700 dark:text-brand-300">
                {importResult.dryRun ? '🔍 پیش‌نمایش — هیچ تغییری ذخیره نشده:' : 'نتیجه:'}{' '}
                {toFa(importResult.createdCount)} جدید · {toFa(importResult.updatedCount)} به‌روزرسانی · {toFa(importResult.skippedCount)} بدون تغییر
              </p>
              <ImportResultList result={importResult} />
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
