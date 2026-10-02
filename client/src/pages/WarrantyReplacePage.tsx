// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Part, type Lists, type Device } from '../api/api';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import JalaliDatePicker from '../components/JalaliDatePicker';
import SelectField from '../components/SelectField';
import StatusBadge from '../components/StatusBadge';
import CatalogAutocomplete from '../components/CatalogAutocomplete';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';

/**
 * صفحه‌ی تعویض قطعه تحت گارنتی.
 *
 * جریان انتخاب (برای تشخیص اینکه چه قطعه‌ای روی چه سروری نصب بوده و تحویل چه مشتری شده):
 *   ۱) انتخاب پروژه (مشتری)
 *   ۲) انتخاب دستگاه (مثلاً سرور HPE DL380 Gen11)
 *   ۳) انتخاب قطعه‌ی خراب از میان قطعات فعال آن دستگاه (با عنوان، پارت‌نامبر، سریال و وضعیت)
 *   ۴) وارد کردن مشخصات قطعه‌ی جدید + کارشناس/دلیل/تاریخ تعویض
 *
 * اگر کاربر از صفحه‌ی جزئیات دستگاه با ?part=X&device=Y وارد شود، همان قطعه/دستگاه
 * پیش‌انتخاب می‌شود ولی امکان تغییر همچنان وجود دارد.
 */
export default function WarrantyReplacePage() {
  const { canReplace } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const prePartId = params.get('part');      // قطعه‌ی پیش‌انتخاب‌شده (اختیاری)
  const preDeviceId = params.get('device');  // دستگاه پیش‌انتخاب‌شده (اختیاری)

  const [lists, setLists] = useState<Lists | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [partsOfDevice, setPartsOfDevice] = useState<Part[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingParts, setLoadingParts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // انتخاب‌های مرحله‌ای
  const [projectId, setProjectId] = useState<number | ''>('');
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [oldPartId, setOldPartId] = useState<number | ''>('');

  const [form, setForm] = useState({
    title: '',
    tech_specs: '',
    part_number_1: '',
    part_number_2: '',
    part_serial_number: '',
    replaced_by_expert_id: '' as number | '',
    failure_reason_id: '' as number | '',
    description: '',
    replaced_at_jalali: '',
  });

  // بارگذاری اولیه‌ی لیست‌ها + دستگاه‌ها + پیش‌انتخاب از query
  useEffect(() => {
    (async () => {
      try {
        const [l, devs] = await Promise.all([
          api.get<Lists>('/lists'),
          api.get<Device[]>('/devices'),
        ]);
        setLists(l);
        setDevices(devs);

        if (preDeviceId) {
          const did = Number(preDeviceId);
          const dev = devs.find((d) => d.id === did);
          if (dev) {
            setProjectId(dev.project_id);
            setDeviceId(dev.id);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingLists(false);
      }
    })();
  }, []);

  // هنگام تغییر دستگاه، قطعات فعال آن را بارگذاری کن
  useEffect(() => {
    if (!deviceId) { setPartsOfDevice([]); setOldPartId(''); return; }
    setLoadingParts(true);
    api
      .getDeviceActiveParts(Number(deviceId))
      .then(setPartsOfDevice)
      .catch((e) => { setError((e as Error).message); setPartsOfDevice([]); })
      .finally(() => setLoadingParts(false));
  }, [deviceId]);

  // پیش‌انتخاب قطعه از query بعد از بارگذاری قطعات دستگاه
  useEffect(() => {
    if (!prePartId || !partsOfDevice.length) return;
    const pid = Number(prePartId);
    // ممکن است قطعه‌ی قدیمی قبلاً active نباشد (مثلاً پس از یک تعویض قبلی)؛
    // در آن حالت آن را از همه‌ی قطعات بگیریم.
    if (partsOfDevice.some((p) => p.id === pid)) {
      setOldPartId(pid);
    }
  }, [partsOfDevice, prePartId]);

  const selectedProject = useMemo(
    () => lists?.projects.find((p) => p.id === projectId) || null,
    [lists, projectId],
  );

  // دستگاه‌های فیلترشده بر اساس پروژه‌ی انتخاب‌شده
  const filteredDevices = useMemo(
    () => (projectId ? devices.filter((d) => d.project_id === projectId) : []),
    [devices, projectId],
  );

  const selectedDevice = useMemo(
    () => filteredDevices.find((d) => d.id === deviceId) || null,
    [filteredDevices, deviceId],
  );

  const oldPart = useMemo(
    () => partsOfDevice.find((p) => p.id === oldPartId) || null,
    [partsOfDevice, oldPartId],
  );

  // پیش‌پر کردن مشخصات قطعه‌ی جدید بر اساس قطعه‌ی قدیمی
  useEffect(() => {
    if (oldPart) {
      setForm((f) => ({
        ...f,
        title: oldPart.title,
        tech_specs: oldPart.tech_specs || '',
        part_number_1: oldPart.part_number_1 || '',
        part_number_2: oldPart.part_number_2 || '',
      }));
    }
  }, [oldPart]);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !oldPartId) {
      setError(t.noActivePart);
      return;
    }
    if (!form.title.trim()) {
      setError('عنوان قطعه‌ی جدید الزامی است.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post<{ newPartId: number }>('/warranty/replace', {
        device_id: Number(deviceId),
        old_part_id: Number(oldPartId),
        new_part: {
          title: form.title.trim(),
          tech_specs: form.tech_specs || undefined,
          part_number_1: form.part_number_1 || undefined,
          part_number_2: form.part_number_2 || undefined,
          part_serial_number: form.part_serial_number || undefined,
        },
        replaced_by_expert_id: form.replaced_by_expert_id ? Number(form.replaced_by_expert_id) : null,
        failure_reason_id: form.failure_reason_id ? Number(form.failure_reason_id) : null,
        description: form.description || undefined,
        replaced_at_jalali: form.replaced_at_jalali || undefined,
      });
      navigate(`/parts/${res.newPartId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingLists) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.loading}</p>;

  // فقط ادمین/کارشناس فنی اجازه ثبت تعویض دارد
  if (!canReplace) {
    return (
      <div className="max-w-2xl mx-auto card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">ثبت تعویض قطعه تحت گارنتی فقط برای کارشناس فنی/مدیر ممکن است.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🔄</span>
        <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">{t.warrantyNew}</h1>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      {/* گام ۱: انتخاب پروژه */}
      <div className="card card-accent">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-3">{t.warrantyStep1}</h3>
        <SelectField
          label={t.projectName}
          value={projectId}
          onChange={(v) => {
            setProjectId(v as number);
            setDeviceId('');
            setOldPartId('');
          }}
          options={lists?.projects || []}
          placeholder={t.selectProject}
          required
        />
      </div>

      {/* گام ۲: انتخاب دستگاه (فقط اگر پروژه انتخاب شده) */}
      {projectId && (
        <div className="card card-accent">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-3">{t.warrantyStep2}</h3>
          {filteredDevices.length === 0 ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm">{t.noData}</p>
          ) : (
            <div className="space-y-2">
              {filteredDevices.map((d) => {
                const active = d.id === deviceId;
                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => { setDeviceId(d.id); setOldPartId(''); }}
                    className={`w-full text-right rounded-lg border p-3 transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-200 card-selected'
                        : 'border-stone-200 dark:border-stone-700 hover:border-brand-300 hover:bg-brand-50/50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        {d.device_type_name || '—'} · {d.brand_name || ''} {d.device_model_name || ''}
                      </span>
                      <span className={`chip ${active ? 'chip-active' : 'chip-default'} !px-2.5 !py-0.5 text-[11px]`}>
                        {t.partsOfDevice}: {toFa(d.parts_count || 0)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400 grid grid-cols-2 gap-x-4">
                      <span>{t.mainSerial}: <b className="fa-nums" dir="ltr">{d.main_serial || '—'}</b></span>
                      <span>{t.contractNumber}: <b className="fa-nums" dir="ltr">{d.contract_number || '—'}</b></span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* گام ۳: انتخاب قطعه‌ی خراب (فقط اگر دستگاه انتخاب شده) */}
      {deviceId && selectedDevice && (
        <div className="card card-accent">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{t.warrantyStep3}</h3>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {selectedDevice.device_type_name} {selectedDevice.brand_name} {selectedDevice.device_model_name}
              {' · '}<span className="fa-nums" dir="ltr">{selectedDevice.main_serial || '—'}</span>
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">{t.partsOfDevice}</p>

          {loadingParts ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm">{t.loading}</p>
          ) : partsOfDevice.length === 0 ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm">{t.partNotFound}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                    <th className="text-right px-3 py-2.5 font-semibold w-8"></th>
                    <th className="text-right px-3 py-2.5 font-semibold">{t.partTitle}</th>
                    <th className="text-right px-3 py-2.5 font-semibold">{t.partNumber1}</th>
                    <th className="text-right px-3 py-2.5 font-semibold">{t.partSerial}</th>
                    <th className="text-right px-3 py-2.5 font-semibold">{t.status}</th>
                    <th className="text-right px-3 py-2.5 font-semibold">{t.soldDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {partsOfDevice.map((p) => {
                    const active = p.id === oldPartId;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setOldPartId(p.id)}
                        className={`border-b border-dashed border-stone-100 dark:border-stone-700 cursor-pointer transition-colors ${
                          active
                            ? 'bg-coral/10 dark:bg-coral/20'
                            : 'hover:bg-brand-50/60 dark:hover:bg-brand-900/25'
                        }`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="radio"
                            name="oldPart"
                            checked={active}
                            onChange={() => setOldPartId(p.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-brand-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-stone-800 dark:text-stone-100">{p.title}</td>
                        <td className="px-3 py-2 fa-nums text-stone-700 dark:text-stone-200" dir="ltr">{p.part_number_1 || '—'}</td>
                        <td className="px-3 py-2 fa-nums text-stone-700 dark:text-stone-200" dir="ltr">{p.part_serial_number || '—'}</td>
                        <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                        <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{formatJalaliLong(p.sold_at_jalali)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {oldPart && (
            <div className="mt-3 rounded-xl border border-coral/30 bg-coral/10 dark:bg-coral/20 p-3 text-xs text-stone-600 dark:text-stone-300">
              <span className="font-semibold text-coral-dark dark:text-coral-light">{t.installedPart}: </span>
              {oldPart.title}
              {' — '}
              <span dir="ltr" className="fa-nums">سریال: {oldPart.part_serial_number || '—'}</span>
            </div>
          )}
        </div>
      )}

      {/* گام ۴: فرم قطعه‌ی جدید (فقط اگر قطعه‌ای انتخاب شده) */}
      {oldPart && (
        <form onSubmit={submit} className="card card-accent space-y-4">
          <h3 className="text-sm font-semibold text-success dark:text-green-400">{t.warrantyStep4}</h3>
          <div>
            <label className="label">{t.partTitle}<span className="text-coral mr-1">*</span></label>
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t.partNumber1}</label>
              <div className="flex gap-2">
                <CatalogAutocomplete
                  value={form.part_number_1}
                  placeholder="پارت‌نامبر… (از کاتالوگ)"
                  onPick={(v) => setForm((f) => ({
                    ...f,
                    part_number_1: v.part_number_1 || f.part_number_1,
                    title: v.title || f.title,
                    tech_specs: v.tech_specs || f.tech_specs,
                  }))}
                  onChange={(v) => set('part_number_1', v)}
                />
              </div>
            </div>
            <div>
              <label className="label">{t.partNumber2}</label>
              <input className="input" dir="ltr" value={form.part_number_2} onChange={(e) => set('part_number_2', e.target.value)} />
            </div>
            <div>
              <label className="label">{t.partSerial}</label>
              <input className="input" dir="ltr" value={form.part_serial_number} onChange={(e) => set('part_serial_number', e.target.value)} />
            </div>
            <JalaliDatePicker label={t.replaceDate} value={form.replaced_at_jalali} onChange={(v) => set('replaced_at_jalali', v)} required />
          </div>
          <div>
            <label className="label">{t.techSpecs}</label>
            <textarea className="input" rows={2} value={form.tech_specs} onChange={(e) => set('tech_specs', e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <SelectField label={t.replaceExpert} value={form.replaced_by_expert_id} onChange={(v) => set('replaced_by_expert_id', v as number)} options={lists?.technicalExperts || []} />
            <SelectField label={t.failureReason} value={form.failure_reason_id} onChange={(v) => set('failure_reason_id', v as number)} options={lists?.failureReasons || []} />
          </div>
          <div>
            <label className="label">{t.replaceDesc}</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">{t.cancel}</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? '...' : 'ثبت تعویض'}</button>
          </div>
        </form>
      )}

      {!projectId && (
        <p className="text-center text-stone-400 dark:text-stone-500 text-sm">{t.noActiveDevice}</p>
      )}
    </div>
  );
}
