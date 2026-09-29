// ============================================================
// مدیریت لیست‌های پیش‌تعریف‌شده — کارشناسان، برندها، انواع، مدل‌ها، پروژه‌ها، دلایل خرابی
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// فقط admin قادر به مشاهده/افزودن/ویرایش/حذف است.
// ============================================================
import React, { useEffect, useState } from 'react';
import { api, type Lists, type SelectItem } from '../api/api';
import { t } from '../i18n/fa';
import Modal from '../components/Modal';
import CatalogManager from '../components/CatalogManager';
import { useAuth } from '../context/AuthContext';

interface ItemDef {
  key: keyof Lists;
  label: string;
  path: string;        // مسیر API
  hasPhone?: boolean;
  hasActive?: boolean; // کارشناسان فروش و فنی ستون active دارند
  extraField?: 'brand_id'; // برای مدل‌ها
  placeholder?: string;
}

const DEFS: ItemDef[] = [
  { key: 'salesExperts',    label: t.manageSalesExperts,    path: 'sales-experts',    hasPhone: true, hasActive: true },
  { key: 'technicalExperts',label: t.manageTechExperts,     path: 'technical-experts',hasPhone: true, hasActive: true },
  { key: 'brands',          label: t.manageBrands,          path: 'brands' },
  { key: 'deviceTypes',     label: t.manageDeviceTypes,     path: 'device-types' },
  { key: 'deviceModels',    label: t.manageModels,          path: 'device-models',    extraField: 'brand_id' },
  { key: 'projects',        label: t.manageProjects,        path: 'projects' },
  { key: 'failureReasons',  label: t.manageFailureReasons,  path: 'failure-reasons' },
];

export default function ListsPage() {
  const { canWrite } = useAuth();
  const [lists, setLists] = useState<Lists | null>(null);
  const [active, setActive] = useState<ItemDef>(DEFS[0]);
  // تب ویژه‌ی کاتالوگ قطعات (خارج از DEFS چپ ساختار لیست معمولی را ندارد)
  const [showCatalog, setShowCatalog] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ name: string; phone: string; brand_id: string; contract_number: string; sales_expert_id: string }>({ name: '', phone: '', brand_id: '', contract_number: '', sales_expert_id: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { setLists(await api.get<Lists>('/lists')); } catch { /* */ }
  };
  useEffect(() => { load(); }, []);

  // کل این صفحه فقط برای ادمین قابل دسترس است
  if (!canWrite) {
    return (
      <div className="card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">دسترسی به مدیریت لیست‌ها فقط برای مدیر/انباردار/کارشناس فنی ممکن است.</p>
      </div>
    );
  }

  const items: (SelectItem & { contract_number?: string; sales_expert_id?: number; brand_name?: string; brand_id?: number })[] =
    (lists?.[active.key] as unknown[] as any) || [];

  const openAddModal = () => {
    setEditingId(null);
    setForm({ name: '', phone: '', brand_id: '', contract_number: '', sales_expert_id: '' });
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      phone: item.phone || '',
      brand_id: item.brand_id ? String(item.brand_id) : '',
      contract_number: item.contract_number || '',
      sales_expert_id: item.sales_expert_id ? String(item.sales_expert_id) : '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() && !active.extraField) return;
    setSaving(true);
    try {
      const body: any = {};

      if (active.key === 'projects') {
        body.name = form.name;
        body.contract_number = form.contract_number || undefined;
        body.sales_expert_id = form.sales_expert_id ? Number(form.sales_expert_id) : undefined;
      } else if (active.extraField) {
        body.name = form.name;
        body.brand_id = Number(form.brand_id);
      } else if (active.hasPhone) {
        body.name = form.name;
        body.phone = form.phone || undefined;
      } else {
        body.name = form.name;
      }

      if (editingId) {
        // ویرایش
        await api.put(`/lists/${active.path}/${editingId}`, body);
      } else {
        // افزودن
        await api.post(`/lists/${active.path}`, body);
      }
      setModalOpen(false);
      await load();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm(t.confirmDelete)) return;
    try { await api.delete(`/lists/${active.path}/${id}`); await load(); }
    catch (e) { alert((e as Error).message); }
  };

  const toggleActive = async (id: number, currentActive: number) => {
    try {
      await api.put(`/lists/${active.path}/${id}`, { active: currentActive ? 0 : 1 });
      await load();
    } catch (e) { alert((e as Error).message); }
  };

  const modalTitle = editingId ? `${t.edit} — ${active.label}` : `${t.addItem} — ${active.label}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold dark:text-stone-50">{t.navLists}</h1>

      {/* تب‌ها */}
      <div className="flex flex-wrap gap-2">
        {DEFS.map((d) => (
          <button
            key={d.key}
            onClick={() => { setActive(d); setShowCatalog(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${!showCatalog && active.key === d.key ? 'bg-brand-600 text-white' : 'bg-white dark:bg-stone-800 border dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-surface-card dark:hover:bg-stone-700'}`}
          >
            {d.label}
          </button>
        ))}
        <button
          onClick={() => setShowCatalog(true)}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${showCatalog ? 'bg-brand-600 text-white' : 'bg-gold/15 text-[#8a6d00] dark:text-gold-light border border-gold/40 hover:bg-gold/25'}`}
          title="تعریف مرجع قطعات — ویرایش و ادغام"
        >
          🧩 کاتالوگ قطعات
        </button>
      </div>

      {showCatalog ? (
        <CatalogManager />
      ) : (
      <>
      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold dark:text-stone-50">{active.label}</h2>
          <button onClick={openAddModal} className="btn-primary text-xs">{t.addItem}</button>
        </div>

        {items.length === 0 ? (
          <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                <th className="text-right px-3 py-2 font-medium">ردیف</th>
                <th className="text-right px-3 py-2 font-medium">{t.name}</th>
                {active.hasPhone && <th className="text-right px-3 py-2 font-medium">{t.phone}</th>}
                {active.extraField && <th className="text-right px-3 py-2 font-medium">{t.brand}</th>}
                {active.key === 'projects' && <th className="text-right px-3 py-2 font-medium">قرارداد / فروش</th>}
                {active.hasActive && <th className="text-right px-3 py-2 font-medium">{t.status}</th>}
                <th className="text-right px-3 py-2 font-medium">{t.actions}</th>
              </tr></thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className="border-b dark:border-stone-700 hover:bg-surface-card dark:hover:bg-brand-900/25">
                    <td className="px-3 py-2 text-stone-400 dark:text-stone-500 fa-nums">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium dark:text-stone-200">{it.name}</td>
                    {active.hasPhone && <td className="px-3 py-2 fa-nums dark:text-stone-300" dir="ltr">{it.phone || '—'}</td>}
                    {active.extraField && <td className="px-3 py-2 dark:text-stone-300">{it.brand_name || '—'}</td>}
                    {active.key === 'projects' && (
                      <td className="px-3 py-2 dark:text-stone-300">
                        <span className="fa-nums" dir="ltr">{it.contract_number || '—'}</span>
                        {lists?.salesExperts.find((s) => s.id === it.sales_expert_id) && (
                          <span className="text-stone-400 dark:text-stone-500 text-xs mr-2">/ {lists.salesExperts.find((s) => s.id === it.sales_expert_id)?.name}</span>
                        )}
                      </td>
                    )}
                    {active.hasActive && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleActive(it.id, it.active || 1)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                            (it.active ?? 1)
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
                          }`}
                          title={(it.active ?? 1) ? 'غیرفعال کردن' : 'فعال کردن'}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full ${(it.active ?? 1) ? 'bg-green-500' : 'bg-stone-400'}`}></span>
                          {(it.active ?? 1) ? t.active : t.inactive}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2 flex gap-3">
                      <button onClick={() => openEditModal(it)} className="text-brand-600 hover:underline text-xs dark:text-brand-400">{t.edit}</button>
                      <button onClick={() => remove(it.id)} className="text-coral hover:text-coral-dark text-xs">{t.delete}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen && !showCatalog} onClose={() => setModalOpen(false)} title={modalTitle}>
        <div className="space-y-4">
          {active.key !== 'projects' && (
            <div>
              <label className="label">{t.name}</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
          )}
          {active.hasPhone && (
            <div>
              <label className="label">{t.phone}</label>
              <input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          )}
          {active.extraField && (
            <div>
              <label className="label">{t.brand}</label>
              <select className="input" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                <option value="">انتخاب برند...</option>
                {lists?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {active.key === 'projects' && (
            <>
              <div>
                <label className="label">{t.name} (پروژه/مشتری)</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="label">شماره قرارداد</label>
                <input className="input" dir="ltr" value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} />
              </div>
              <div>
                <label className="label">{t.salesExpert}</label>
                <select className="input" value={form.sales_expert_id} onChange={(e) => setForm({ ...form, sales_expert_id: e.target.value })}>
                  <option value="">انتخاب...</option>
                  {lists?.salesExperts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? '...' : t.save}</button>
          </div>
        </div>
      </Modal>
      </>
      )}
    </div>
  );
}
