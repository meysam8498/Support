// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { api, type Device, type Part } from '../api/api';
import { t } from '../i18n/fa';
import JalaliDatePicker from '../components/JalaliDatePicker';
import CatalogAutocomplete from '../components/CatalogAutocomplete';
import { useAuth } from '../context/AuthContext';

export default function PartFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  const presetDevice = params.get('device');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    device_id: presetDevice ? Number(presetDevice) : '' as number | '',
    title: '',
    tech_specs: '',
    part_number_1: '',
    part_number_2: '',
    part_serial_number: '',
    sold_at_jalali: '',
  });

  useEffect(() => {
    (async () => {
      try {
        setDevices(await api.get<Device[]>('/devices'));
        if (isEdit) {
          const p = await api.get<{ part: Part }>(`/parts/${id}`);
          setForm({
            device_id: p.part.device_id,
            title: p.part.title,
            tech_specs: p.part.tech_specs || '',
            part_number_1: p.part.part_number_1 || '',
            part_number_2: p.part.part_number_2 || '',
            part_serial_number: p.part.part_serial_number || '',
            sold_at_jalali: p.part.sold_at_jalali || '',
          });
        }
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_id || !form.title.trim()) {
      setError('دستگاه و عنوان قطعه الزامی است.');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        device_id: Number(form.device_id),
        title: form.title.trim(),
        tech_specs: form.tech_specs || undefined,
        part_number_1: form.part_number_1 || undefined,
        part_number_2: form.part_number_2 || undefined,
        part_serial_number: form.part_serial_number || undefined,
        sold_at_jalali: form.sold_at_jalali || undefined,
      };
      if (isEdit) {
        await api.put(`/parts/${id}`, payload);
        navigate(`/parts/${id}`);
      } else {
        const res = await api.post<{ id: number }>('/parts', payload);
        navigate(`/parts/${res.id}`);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.loading}</p>;

  // کاربر غیر ادمین اجازه ایجاد/ویرایش ندارد
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">دسترسی ثبت/ویرایش قطعه فقط برای کارشناس مجاز (ادمین) است.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold dark:text-stone-50">{isEdit ? 'ویرایش قطعه' : t.addPart}</h1>
      {error && <p className="p-3 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg text-sm">{error}</p>}
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">دستگاه<span className="text-coral mr-1">*</span></label>
          <select className="input" value={form.device_id} onChange={(e) => set('device_id', Number(e.target.value))} required disabled={!!presetDevice && !isEdit}>
            <option value="">انتخاب دستگاه...</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.project_name} — {d.main_serial || d.device_type_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.partTitle}<span className="text-coral mr-1">*</span></label>
          <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">{t.partNumber1} <span className="text-[10px] text-stone-400">(از کاتالوگ — عنوان و مشخصات خودکار پر می‌شود)</span></label>
            <CatalogAutocomplete
              value={form.part_number_1}
              placeholder="پارت‌نامبر… (۲+ نویسه)"
              onChange={(v) => set('part_number_1', v)}
              onPick={(sel) =>
                setForm((f) => ({
                  ...f,
                  title: sel.title || f.title,
                  tech_specs: sel.tech_specs || f.tech_specs,
                  part_number_1: sel.part_number_1 || f.part_number_1,
                  part_number_2: sel.part_number_2 || f.part_number_2,
                }))
              }
            />
          </div>
          <div>
            <label className="label">{t.partNumber2}</label>
            <input className="input" dir="ltr" value={form.part_number_2} onChange={(e) => set('part_number_2', e.target.value)} />
          </div>
          <div>
            <label className="label">{t.partSerial}</label>
            <input className="input" dir="ltr" value={form.part_serial_number} onChange={(e) => set('part_serial_number', e.target.value)} />
          </div>
          <JalaliDatePicker label={t.soldDate} value={form.sold_at_jalali} onChange={(v) => set('sold_at_jalali', v)} />
        </div>
        <div>
          <label className="label">{t.techSpecs}</label>
          <textarea className="input" rows={2} value={form.tech_specs} onChange={(e) => set('tech_specs', e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">{t.cancel}</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? '...' : t.save}</button>
        </div>
      </form>
    </div>
  );
}
