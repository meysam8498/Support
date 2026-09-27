// ============================================================
// فرم ثبت/ویرایش تجهیز
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// شامل تمام فیلدها: انبار، تحویل، گارانتی، وضعیت، دلایل تعویض.
// فقط مدیر قابل دسترسی است (گیت در مسیر).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Lists, type Device } from '../api/api';
import { t } from '../i18n/fa';
import SelectField from '../components/SelectField';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { addMonthsToJalali, formatJalaliLong } from '../lib/date';

interface DeviceForm {
  project_id: number | '';
  contract_number: string;
  sales_expert_id: number | '';
  main_serial: string;
  part_number_1: string;
  part_number_2: string;
  device_type_id: number | '';
  device_model_id: number | '';
  brand_id: number | '';
  technical_expert_id: number | '';
  description: string;
  warehouse_exit_jalali: string;
  customer_delivery_jalali: string;
  warranty_duration_months: number | '';
  warranty_start_jalali: string;
  status: string;
  replacement_reason_type: string;
  replacement_reason_desc: string;
  sold_at_jalali: string;
}

const EMPTY: DeviceForm = {
  project_id: '',
  contract_number: '',
  sales_expert_id: '',
  main_serial: '',
  part_number_1: '',
  part_number_2: '',
  device_type_id: '',
  device_model_id: '',
  brand_id: '',
  technical_expert_id: '',
  description: '',
  warehouse_exit_jalali: '',
  customer_delivery_jalali: '',
  warranty_duration_months: '',
  warranty_start_jalali: '',
  status: 'active',
  replacement_reason_type: '',
  replacement_reason_desc: '',
  sold_at_jalali: '',
};

export default function DeviceFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [lists, setLists] = useState<Lists | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<DeviceForm>(EMPTY);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Lists>('/lists');
        setLists(l);
        if (isEdit) {
          const detail = await api.get<{ device: Device }>(`/devices/${id}`);
          const d = detail.device;
          setForm({
            project_id: d.project_id,
            contract_number: d.contract_number || '',
            sales_expert_id: d.sales_expert_id || '',
            main_serial: d.main_serial || '',
            part_number_1: d.part_number_1 || '',
            part_number_2: d.part_number_2 || '',
            device_type_id: d.device_type_id,
            device_model_id: d.device_model_id || '',
            brand_id: d.brand_id || '',
            technical_expert_id: d.technical_expert_id || '',
            description: d.description || '',
            warehouse_exit_jalali: d.warehouse_exit_jalali || '',
            customer_delivery_jalali: d.customer_delivery_jalali || '',
            warranty_duration_months: d.warranty_duration_months ?? '',
            warranty_start_jalali: d.warranty_start_jalali || '',
            status: d.status || 'active',
            replacement_reason_type: d.replacement_reason_type || '',
            replacement_reason_desc: d.replacement_reason_desc || '',
            sold_at_jalali: d.sold_at_jalali || '',
          });
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const set = <K extends keyof DeviceForm>(k: K, v: DeviceForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // پایان گارانتی به‌صورت نمایشی محاسبه می‌شود (محاسبه‌ی نهایی در backend انجام می‌شود)
  const warrantyEndPreview = useMemo(() => {
    if (!form.warranty_start_jalali || !form.warranty_duration_months) return '';
    return addMonthsToJalali(form.warranty_start_jalali, Number(form.warranty_duration_months)) || '';
  }, [form.warranty_start_jalali, form.warranty_duration_months]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_id || !form.device_type_id) {
      setError('نام پروژه و نوع تجهیز الزامی است.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        project_id: Number(form.project_id),
        contract_number: form.contract_number || undefined,
        sales_expert_id: form.sales_expert_id ? Number(form.sales_expert_id) : null,
        main_serial: form.main_serial || undefined,
        part_number_1: form.part_number_1 || undefined,
        part_number_2: form.part_number_2 || undefined,
        device_type_id: Number(form.device_type_id),
        device_model_id: form.device_model_id ? Number(form.device_model_id) : null,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        technical_expert_id: form.technical_expert_id ? Number(form.technical_expert_id) : null,
        description: form.description || undefined,
        warehouse_exit_jalali: form.warehouse_exit_jalali || null,
        customer_delivery_jalali: form.customer_delivery_jalali || null,
        warranty_duration_months: form.warranty_duration_months ? Number(form.warranty_duration_months) : null,
        warranty_start_jalali: form.warranty_start_jalali || null,
        status: form.status,
        replacement_reason_type: form.replacement_reason_type || null,
        replacement_reason_desc: form.replacement_reason_desc || null,
        sold_at_jalali: form.sold_at_jalali || undefined,
      };
      if (isEdit) {
        await api.put(`/devices/${id}`, payload);
        navigate(`/devices/${id}`);
      } else {
        const res = await api.post<{ id: number }>('/devices', payload);
        navigate(`/devices/${res.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-stone-400 text-center mt-20 dark:text-stone-500">{t.loading}</p>;

  const filteredModels = lists
    ? lists.deviceModels.filter((m) => !form.brand_id || m.brand_id === form.brand_id)
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold dark:text-stone-50">{isEdit ? t.editDevice : t.addDevice}</h1>

      {error && (
        <p className="p-3 bg-red-50 text-red-600 rounded-lg text-sm dark:bg-red-900/30 dark:text-red-300">{error}</p>
      )}

      <form onSubmit={submit} className="card space-y-5">
        {/* اطلاعات پایه */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-300">اطلاعات پایه</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <SelectField label={t.projectName} value={form.project_id} onChange={(v) => set('project_id', v as number)} required
              options={lists?.projects || []} />
            <div>
              <label className="label">{t.contractNumber}</label>
              <input className="input" value={form.contract_number} onChange={(e) => set('contract_number', e.target.value)} dir="ltr" />
            </div>
            <SelectField label={t.salesExpert} value={form.sales_expert_id} onChange={(v) => set('sales_expert_id', v as number)}
              options={lists?.salesExperts || []} />
            <div>
              <label className="label">{t.mainSerial}</label>
              <input className="input" value={form.main_serial} onChange={(e) => set('main_serial', e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="label">{t.partNumber1}</label>
              <input className="input" value={form.part_number_1} onChange={(e) => set('part_number_1', e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="label">{t.partNumber2}</label>
              <input className="input" value={form.part_number_2} onChange={(e) => set('part_number_2', e.target.value)} dir="ltr" />
            </div>
            <SelectField label={t.deviceType} value={form.device_type_id} onChange={(v) => set('device_type_id', v as number)} required
              options={lists?.deviceTypes || []} />
            <SelectField label={t.brand} value={form.brand_id} onChange={(v) => set('brand_id', v as number)}
              options={lists?.brands || []} />
            <SelectField label={t.deviceModel} value={form.device_model_id} onChange={(v) => set('device_model_id', v as number)}
              options={filteredModels} />
            <SelectField label={t.technicalExpert} value={form.technical_expert_id} onChange={(v) => set('technical_expert_id', v as number)}
              options={lists?.technicalExperts || []} />
          </div>
        </div>

        {/* انبار و تحویل */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-300">انبار و تحویل</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <JalaliDatePicker label={t.warehouseExitDate} value={form.warehouse_exit_jalali} onChange={(v) => set('warehouse_exit_jalali', v)} />
            <JalaliDatePicker label={t.customerDeliveryDate} value={form.customer_delivery_jalali} onChange={(v) => set('customer_delivery_jalali', v)} />
          </div>
        </div>

        {/* گارانتی */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-300">گارانتی</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.warrantyDuration}</label>
              <input type="number" min={0} className="input fa-nums" dir="ltr" value={form.warranty_duration_months}
                onChange={(e) => set('warranty_duration_months', e.target.value ? Number(e.target.value) : '')} />
            </div>
            <JalaliDatePicker label={t.warrantyStart} value={form.warranty_start_jalali} onChange={(v) => set('warranty_start_jalali', v)} />
          </div>
          {warrantyEndPreview && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              {t.warrantyEnd}: <span className="fa-nums font-medium">{formatJalaliLong(warrantyEndPreview)}</span>
            </p>
          )}
        </div>

        {/* وضعیت و دلایل تعویض */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-300">وضعیت و دلایل تعویض</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.deviceStatus}</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">{t.statusActive}</option>
                <option value="defective">{t.statusDefective}</option>
                <option value="replacing">{t.statusReplacing}</option>
                <option value="replaced">{t.statusReplaced}</option>
              </select>
            </div>
            <div>
              <label className="label">{t.replacementReasonType}</label>
              <select className="input" value={form.replacement_reason_type}
                onChange={(e) => set('replacement_reason_type', e.target.value)}>
                <option value="">—</option>
                <option value="hardware">{t.reasonHardware}</option>
                <option value="software">{t.reasonSoftware}</option>
                <option value="other">{t.reasonOther}</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">{t.replacementReasonDesc}</label>
            <textarea className="input" rows={2} value={form.replacement_reason_desc}
              onChange={(e) => set('replacement_reason_desc', e.target.value)} />
          </div>
        </div>

        {/* توضیحات */}
        <div>
          <label className="label">{t.description}</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">{t.cancel}</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? '...' : t.save}</button>
        </div>
      </form>
    </div>
  );
}
