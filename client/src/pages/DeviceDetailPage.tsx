// ============================================================
// جزئیات تجهیز — با فیلدهای گارانتی، درخواست گارانتی، تأمین قطعات
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Device, type Part, type Replacement, type WarrantyRequest } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';

interface Detail {
  device: Device & { project_name?: string; sales_expert_name?: string; device_type_name?: string; device_model_name?: string; brand_name?: string; technical_expert_name?: string };
  parts: (Part & { source?: string; supplier_warranty_months?: number; purchase_jalali?: string })[];
  replacements: Replacement[];
  warrantyRequests: WarrantyRequest[];
}

const REQ_STATUS: Record<string, { cls: string; label: string }> = {
  pending:  { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', label: t.requestPending },
  approved: { cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: t.requestApproved },
  rejected: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: t.requestRejected },
  completed: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', label: t.requestCompleted },
};

const REASON_TYPE: Record<string, string> = {
  hardware: t.reasonHardware,
  software: t.reasonSoftware,
  other: t.reasonOther,
};

export default function DeviceDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setData(await api.get<Detail>(`/devices/${id}`)); }
    catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <p className="text-stone-400 text-center mt-20 dark:text-stone-500">{t.loading}</p>;
  if (!data) return <p className="text-stone-400 text-center mt-20 dark:text-stone-500">{t.noData}</p>;

  const { device: d } = data;

  // بررسی وضعیت گارانتی
  const warrantyStatus = d.warranty_end_gregorian
    ? (new Date(d.warranty_end_gregorian) > new Date() ? t.warrantyValid : t.warrantyExpired)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold dark:text-stone-50">جزئیات تجهیز</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Link to={`/devices/${d.id}/edit`} className="btn-secondary">{t.edit}</Link>
            <Link to={`/parts/new?device=${d.id}`} className="btn-primary">{t.addPart}</Link>
          </div>
        )}
      </div>

      {/* مشخصات */}
      <div className="card">
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Spec label={t.projectName} value={d.project_name} />
          <Spec label={t.contractNumber} value={d.contract_number} ltr />
          <Spec label={t.salesExpert} value={d.sales_expert_name} />
          <Spec label={t.mainSerial} value={d.main_serial} ltr />
          <Spec label={t.partNumber1} value={d.part_number_1} ltr />
          <Spec label={t.partNumber2} value={d.part_number_2} ltr />
          <Spec label={t.deviceType} value={d.device_type_name} />
          <Spec label={t.deviceModel} value={d.device_model_name} />
          <Spec label={t.brand} value={d.brand_name} />
          <Spec label={t.technicalExpert} value={d.technical_expert_name} />
          <div className="flex flex-col">
            <span className="text-stone-400 text-xs dark:text-stone-500">{t.deviceStatus}</span>
            {d.status ? <StatusBadge status={d.status} /> : <span>—</span>}
          </div>
          {d.replacement_reason_type && (
            <Spec label={t.replacementReasonType} value={REASON_TYPE[d.replacement_reason_type] || d.replacement_reason_type} />
          )}
          {d.replacement_reason_desc && (
            <Spec label={t.replacementReasonDesc} value={d.replacement_reason_desc} />
          )}
        </div>
      </div>

      {/* انبار و تحویل */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-200">انبار و تحویل</h2>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Spec label={t.warehouseExitDate} value={formatJalaliLong(d.warehouse_exit_jalali)} />
          <Spec label={t.customerDeliveryDate} value={formatJalaliLong(d.customer_delivery_jalali)} />
        </div>
      </div>

      {/* گارانتی */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-200">گارانتی</h2>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Spec label={t.warrantyDuration} value={d.warranty_duration_months ? `${toFa(d.warranty_duration_months)} ماه` : '—'} />
          <Spec label={t.warrantyStart} value={formatJalaliLong(d.warranty_start_jalali)} />
          <Spec label={t.warrantyEnd} value={formatJalaliLong(d.warranty_end_jalali)} />
          {warrantyStatus && (
            <div className="flex flex-col">
              <span className="text-stone-400 text-xs dark:text-stone-500">وضعیت گارانتی</span>
              <span className={`text-sm font-medium ${warrantyStatus === t.warrantyValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {warrantyStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* درخواست‌های گارانتی */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-200">{t.warrantyRequests} ({toFa(data.warrantyRequests.length)})</h2>
        {data.warrantyRequests.length === 0 ? (
          <p className="text-stone-400 text-sm dark:text-stone-500">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-card text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                <th className="text-right px-3 py-2 font-medium">{t.requestDate}</th>
                <th className="text-right px-3 py-2 font-medium">{t.requestStatus}</th>
                <th className="text-right px-3 py-2 font-medium">{t.description}</th>
              </tr></thead>
              <tbody>
                {data.warrantyRequests.map((wr) => {
                  const st = REQ_STATUS[wr.status] || REQ_STATUS.pending;
                  return (
                    <tr key={wr.id} className="border-b dark:border-stone-700">
                      <td className="px-3 py-2 text-xs fa-nums">{formatJalaliLong(wr.request_jalali)}</td>
                      <td className="px-3 py-2"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{wr.description || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* قطعات (با اطلاعات تأمین) */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-200">قطعات این تجهیز ({toFa(data.parts.length)})</h2>
        {data.parts.length === 0 ? (
          <p className="text-stone-400 text-sm dark:text-stone-500">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-card text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                <th className="text-right px-3 py-2 font-medium">{t.partTitle}</th>
                <th className="text-right px-3 py-2 font-medium">{t.partNumber1}</th>
                <th className="text-right px-3 py-2 font-medium">{t.partSerial}</th>
                <th className="text-right px-3 py-2 font-medium">{t.status}</th>
                <th className="text-right px-3 py-2 font-medium">تأمین</th>
                <th className="text-right px-3 py-2 font-medium">{t.actions}</th>
              </tr></thead>
              <tbody>
                {data.parts.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-surface-card dark:border-stone-700 dark:hover:bg-brand-900/25">
                    <td className="px-3 py-2"><Link to={`/parts/${p.id}`} className="text-brand-600 hover:underline dark:text-brand-400">{p.title}</Link></td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">{p.part_number_1 || '—'}</td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">{p.part_serial_number || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                      {p.source ? (p.source === 'internal' ? t.sourceInternal : t.sourceExternal) : '—'}
                      {p.supplier_warranty_months ? ` · ${toFa(p.supplier_warranty_months)} ماه` : ''}
                    </td>
                    <td className="px-3 py-2">
                      {isAdmin && p.status === 'active' && (
                        <Link to={`/warranty/replace?part=${p.id}&device=${d.id}`} className="text-amber-600 hover:underline text-xs dark:text-amber-400">{t.replacePart}</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* تاریخچه تعویض گارنتی */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3 dark:text-stone-200">تاریخچه تعویض ({toFa(data.replacements.length)})</h2>
        {data.replacements.length === 0 ? (
          <p className="text-stone-400 text-sm dark:text-stone-500">{t.noData}</p>
        ) : (
          <div className="space-y-3">
            {data.replacements.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 text-sm dark:border-stone-700">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-medium text-red-600 dark:text-red-400">{r.old_part_title}</span>
                    <span className="mx-2 text-stone-400">→</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{r.new_part_title}</span>
                  </div>
                  <span className="text-xs text-stone-400 fa-nums dark:text-stone-500">{formatJalaliLong(r.replaced_at_jalali)}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <span>کارشناس: {r.expert_name || '—'}</span>
                  <span>دلیل: {r.failure_reason_name || '—'}</span>
                  <span className="fa-nums" dir="ltr">قدیمی: {r.old_part_serial || '—'}</span>
                  <span className="fa-nums" dir="ltr">جدید: {r.new_part_serial || '—'}</span>
                </div>
                {r.description && <p className="mt-2 text-xs text-stone-600 bg-surface-card p-2 rounded dark:bg-stone-700 dark:text-stone-300">{r.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ردیف نمایشی مشخصات */
function Spec({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-stone-400 text-xs dark:text-stone-500">{label}</span>
      <span className={`font-medium fa-nums ${ltr ? 'dir-ltr' : ''}`} style={ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}>{value || '—'}</span>
    </div>
  );
}
