// ============================================================
// مدیریت کاتالوگ قطعات — ویرایش مراجع و ادغام تکراری‌ها
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • جست‌وجو در مراجع + شمارنده‌ی نصب‌شده‌ها
// • ویرایش کامل مرجع (پارت‌نامبر ۱ و ۲، عنوان، مشخصات، یادداشت) → sync خودکار همه‌ی قطعات وصل (سمت سرور)
// • ادغام چند مرجع (وقتی یک PN به دو شکل ثبت شده) — قطعات به مرجع اصلی منتقل
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';
import Modal from './Modal';
import InlineEditCell from './InlineEditCell';
import { useAuth } from '../context/AuthContext';

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
