// ============================================================
// صفحه‌ی ورود سریال‌ها از فایل اکسل — سیستم طراحی Flip7 — فقط مدیر
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// جریان: ۱) انتخاب پروژه  ۲) انتخاب تجهیز همان پروژه  ۳) آپلود فایل
// بدون پروژه/تجهیز مقصد، آپلود ممکن نیست (جلوی ثبت بی‌مقصد گرفته می‌شود).
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Device, type Project } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';

interface ImportSummary {
  file: string;
  projectId: number;
  projectName?: string | null;
  deviceId?: number | null;
  deviceMainSerial?: string | null;
  devicesCreated?: number;
  columnsTotal: number;
  columnsMatched: number;
  columnsCreated: number;
  serialRows: number;
  partsUpdated: number;
  partsCreated: number;
  deviceSerialUpdated: boolean;
}

interface DescConflict {
  partNumber: string;
  title: string;
  descriptions: string[];
  note: string;
}

interface ImportResult {
  ok: boolean;
  summary: ImportSummary;
  descConflicts?: DescConflict[];
  unmatchedPartNumbers: string[];
  skipped: { row: number; column: string; partNumber: string; reason: string }[];
}

export default function SerialImportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [perRow, setPerRow] = useState(false); // هر ردیف = یک دستگاه جدید
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [lists, dev] = await Promise.all([
          api.get<{ projects: Project[] }>('/lists'),
          api.get<Device[]>('/devices'),
        ]);
        setProjects(lists.projects);
        setDevices(dev);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // فقط تجهیزات همان پروژه
  const projectDevices = useMemo(
    () => (projectId === '' ? [] : devices.filter((d) => d.project_id === projectId)),
    [devices, projectId]
  );

  const selectedDevice = projectDevices.find((d) => d.id === deviceId);
  const selectedProject = projects.find((p) => p.id === projectId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!projectId) return setError('ابتدا پروژه‌ی مقصد را انتخاب کنید.');
    if (!deviceId && !perRow)
      return setError('تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید.');
    if (!file) return setError('فایل اکسل را انتخاب کنید.');

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('project_id', String(projectId));
      if (deviceId) fd.append('device_id', String(deviceId));
      if (perRow) fd.append('create_per_row', '1');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/serial-import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
      setResult(data as ImportResult);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const s = result?.summary;

  if (loading) {
    return <p className="text-brand-300 text-center mt-20 dark:text-brand-400">{t.loading}</p>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">📥</span>
        <h1 className="text-xl font-extrabold text-brand-800 dark:text-brand-100">ورود سریال‌ها از فایل اکسل</h1>
      </div>

      {/* راهنمای قالب — جداکننده‌ی نقطه‌چین مثل Flip7 */}
      <details className="card card-accent" open={!result}>
        <summary className="cursor-pointer font-bold text-brand-700 dark:text-brand-200 border-b-2 border-dashed border-brand-100 dark:border-brand-800 pb-2 mb-3">
          قالب فایل (مطابق فهرست قطعات انبار)
        </summary>
        <ul className="list-disc pr-5 space-y-1 text-sm leading-6 text-brand-800 dark:text-brand-200">
          <li><b>ردیف ۱:</b> عنوان قطعه در هر ستون (Case، Main Board، Power، …)</li>
          <li><b>ردیف ۲:</b> توضیحات/مدل قطعه (اختیاری)</li>
          <li><b>ردیف ۳:</b> پارت‌نامبر هر قطعه — کلید تطبیق با سامانه</li>
          <li><b>ردیف ۴ به بعد:</b> سریال‌ها — هر ردیف = یک دستگاه</li>
          <li>ستون A فقط شماره‌ی ردیف است و نادیده گرفته می‌شود.</li>
        </ul>
        <p className="text-xs text-brand-500 dark:text-brand-300/80 leading-5 mt-2">
          اگر پارت‌نامبری در دستگاه مقصد وجود نداشته باشد، قطعه‌ی جدید با همان عنوان و پارت‌نامبر
          روی دستگاه مقصد ساخته می‌شود. هیچ داده‌ای حذف نمی‌شود.
        </p>
      </details>

      <form onSubmit={submit} className="card card-accent space-y-4">
        {/* گام ۱ و ۲ — مقصد الزامی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">
              ۱) پروژه‌ی مقصد <span className="text-coral">*</span>
            </label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value ? Number(e.target.value) : '');
                setDeviceId('');
              }}
              required
            >
              <option value="">انتخاب پروژه...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.contract_number ? ` (${p.contract_number})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">۲) تجهیز مقصد</label>
            <select
              className="input"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}
              disabled={projectId === ''}
            >
              <option value="">
                {projectId === '' ? 'ابتدا پروژه را انتخاب کنید' : 'انتخاب تجهیز (یا حالت پایین)...'}
              </option>
              {projectDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.device_type_name || 'تجهیز'} — سریال: {d.main_serial || '—'}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 mt-2 text-xs text-brand-600 dark:text-brand-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={perRow}
                onChange={(e) => {
                  setPerRow(e.target.checked);
                  if (e.target.checked) setDeviceId('');
                }}
                className="w-4 h-4 accent-[#2BA8A2]"
              />
              هر ردیف اکسل = یک دستگاه جدید (برای فایل‌های چنددستگاهه مثل فهرست انبار)
            </label>
          </div>
        </div>

        {/* نوار مقصد انتخاب‌شده */}
        {(selectedDevice || perRow) && (
          <div className="rounded-2xl bg-brand-50 border-2 border-brand-200 px-4 py-3 text-sm text-brand-800 dark:bg-brand-900/40 dark:border-brand-700 dark:text-brand-100">
            <span className="font-bold">مقصد:</span> {selectedProject?.name}
            {perRow ? (
              <>
                <span className="mx-2 text-brand-300">|</span>
                حالت چنددستگاهه: ردیف‌های دارای سریال دستگاه (ستون Case) دستگاه جدید می‌سازند
              </>
            ) : (
              <>
                {' ← '}{selectedDevice!.device_type_name}
                {selectedDevice!.brand_name ? ` (${selectedDevice!.brand_name})` : ''}
                <span className="mx-2 text-brand-300">|</span>
                سریال فعلی: <span dir="ltr" className="font-bold">{selectedDevice!.main_serial || '—'}</span>
                <span className="mx-2 text-brand-300">|</span>
                <Link to={`/devices/${selectedDevice!.id}`} className="underline text-brand-600 dark:text-brand-300">
                  مشاهده‌ی تجهیز
                </Link>
              </>
            )}
          </div>
        )}

        <div>
          <label className="label">۳) فایل اکسل (xlsx / xls)</label>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && (
          <p className="p-3 bg-coral/10 text-coral-dark rounded-xl text-sm border-2 border-coral/30 dark:text-coral-light">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={busy || !file || !projectId || (!deviceId && !perRow)}
        >
          {busy ? 'در حال پردازش...' : 'آپلود و به‌روزرسانی سریال‌ها'}
        </button>
      </form>

      {s && (
        <div className="card card-accent space-y-3">
          <p className="font-extrabold text-brand-600 dark:text-brand-300">
            ✓ عملیات با موفقیت روی «{s.projectName}» انجام شد
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="فایل">{s.file}</Stat>
            <Stat label="ستون‌های شناسایی‌شده">{toFa(s.columnsTotal)}</Stat>
            <Stat label="ستون‌های تطبیق‌یافته">{toFa(s.columnsMatched)}</Stat>
            <Stat label="ردیف‌های سریال">{toFa(s.serialRows)}</Stat>
            <Stat label="سریال قطعات به‌روزرسانی‌شده">{toFa(s.partsUpdated)}</Stat>
            <Stat label="قطعات جدید ساخته‌شده">{toFa(s.partsCreated)}</Stat>
            {(s.devicesCreated ?? 0) > 0 && (
              <Stat label="دستگاه‌های جدید ساخته‌شده">{toFa(s.devicesCreated!)}</Stat>
            )}
          </div>
          {s.deviceSerialUpdated && (
            <p className="text-sm text-brand-600 dark:text-brand-300">
              ★ سریال اصلی دستگاه نیز به‌روزرسانی شد.
            </p>
          )}

          {/* توضیحات چندگانه — برای انتخاب توضیح درست */}
          {(result!.descConflicts?.length ?? 0) > 0 && (
            <div className="rounded-2xl bg-gold/10 border-2 border-gold/40 px-4 py-3 text-sm space-y-2">
              <p className="font-bold text-[#8a6d00] dark:text-gold-light">
                ⚠ توضیحات متفاوت برای یک پارت‌نامبر ({toFa(result!.descConflicts!.length)}): همگی در
                فیلد «مشخصات فنی» ذخیره شدند — در فهرست قطعات توضیح درست را انتخاب کنید.
              </p>
              <ul className="space-y-1 text-xs">
                {result!.descConflicts!.map((dc) => (
                  <li key={dc.partNumber}>
                    <span dir="ltr" className="font-bold">{dc.partNumber}</span>{' '}({dc.title}):{' '}
                    <span dir="auto">{dc.descriptions.join(' ⟷ ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result!.unmatchedPartNumbers.length > 0 && (
            <div className="text-sm">
              <p className="font-bold text-coral-dark dark:text-coral-light mb-1">
                پارت‌نامبرهای بدون تطبیق ({toFa(result!.unmatchedPartNumbers.length)}):
              </p>
              <div className="flex flex-wrap gap-1">
                {result!.unmatchedPartNumbers.map((pn) => (
                  <span
                    key={pn}
                    className="px-2 py-0.5 bg-gold/15 text-[#8a6d00] dark:text-gold-light rounded-full text-xs border border-gold/40"
                    dir="ltr"
                  >
                    {pn}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result!.skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-coral-dark dark:text-coral-light">
                سلول‌های نادیده‌گرفته‌شده ({toFa(result!.skipped.length)})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-brand-500 dark:text-brand-300/80">
                {result!.skipped.map((sk, i) => (
                  <li key={i}>
                    ردیف {toFa(sk.row)} / ستون {sk.column} ({sk.partNumber}): {sk.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-brand-50 dark:bg-brand-900/40 p-3 border border-brand-100 dark:border-brand-800">
      <p className="text-xs text-brand-500 dark:text-brand-300/80 mb-1">{label}</p>
      <p className="font-bold text-brand-800 dark:text-brand-100 truncate" dir="auto">
        {children}
      </p>
    </div>
  );
}
