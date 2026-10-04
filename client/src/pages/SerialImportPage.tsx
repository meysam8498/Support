// ============================================================
// صفحه‌ی ورود سریال‌ها از فایل اکسل — سیستم طراحی Ember Studio — فقط مدیر
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// جریان: ۱) انتخاب پروژه  ۲) انتخاب تجهیز همان پروژه  ۳) آپلود فایل
// بدون پروژه/تجهیز مقصد، آپلود ممکن نیست (جلوی ثبت بی‌مقصد گرفته می‌شود).
// پیش‌نمایش خشک: پیش از ثبت واقعی، تطبیق ستون‌ها و اقدام‌های ردیف‌به‌ردیف
// از سرور گرفته و نمایش داده می‌شود — بدون هیچ تغییری در پایگاه‌داده.
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Device, type Project } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';
import { downloadAuthenticated } from '../lib/download';
import Alert from '../components/Alert';

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
  /** تعداد مراجع کاتالوگ ساخته‌شده از پارت‌نامبرهای ناشناس */
  catalogCreated?: number;
  deviceSerialUpdated: boolean;
}

interface DescConflict {
  partNumber: string;
  title: string;
  descriptions: string[];
  note: string;
}

/** پیشنهاد ساخت مرجع کاتالوگ برای پارت‌نامبر ناشناس — از عنوان/توضیحات فایل */
interface CatalogSuggestion {
  partNumber: string;
  title: string;
  techSpecs: string | null;
  firstRow: number;
}

interface ImportResult {
  ok: boolean;
  summary: ImportSummary;
  descConflicts?: DescConflict[];
  unmatchedPartNumbers: string[];
  skipped: { row: number; column: string; partNumber: string; reason: string }[];
}

// ---------- پیش‌نمایش خشک (dry-run) ----------

// ---------- پیش‌نمایش خشک (dry-run) ----------
type PreviewColumnStatus = 'matched' | 'new' | 'device_serial';

interface PreviewColumn {
  colLetter: string;
  partNumber: string;
  title: string;
  desc: string | null;
  status: PreviewColumnStatus;
  matchedFrom: 'device' | 'system' | null;
  existingCount: number;
  partTitles: string[];
}

type PreviewActionKind = 'update_part' | 'create_part' | 'set_main_serial';

interface PreviewAction {
  row: number;
  col: string;
  partNumber: string;
  serial: string;
  action: PreviewActionKind;
  target: string;
}

interface ImportPreview {
  file: string;
  projectName: string | null;
  mode: 'single' | 'per_row';
  rowsDetected: number;
  columnsTotal: number;
  columnsMatched: number;
  columnsCreated: number;
  willUpdateParts: number;
  willCreateParts: number;
  willCreateDevices: number;
  willUpdateMainSerial: boolean;
  /** تعداد مراجع کاتالوگ که با ثبت فعلی ساخته می‌شوند */
  willCreateCatalog: number;
  columns: PreviewColumn[];
  actions: PreviewAction[];
  actionsTruncated: boolean;
  actionsCap: number;
  descConflicts: DescConflict[];
  catalogSuggestions: CatalogSuggestion[];
  warnings: string[];
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
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------- حالت «چسباندن لیست» (بدون فایل) ----------
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  /** ساخت مرجع کاتالوگ برای پارت‌نامبرهای ناشناس هنگام ثبت (پیش‌فرض: فعال) */
  const [createCatalog, setCreateCatalog] = useState(true);

  /** دانلود قالب نمونه — با توکن (لینک ساده ۴۰۱ می‌دهد) */
  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await downloadAuthenticated('/serial-import/template', 'support-parts-template.xlsx');
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setTemplateBusy(false);
    }
  };

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

  /** پیش‌نمایش خشک: همان بدنه‌ی آپلود به /preview می‌رود — بدون هیچ تغییری در دیتابیس */
  const runPreview = async () => {
    setError('');
    setPreviewError('');
    setResult(null);
    if (!projectId) return setPreviewError('ابتدا پروژه‌ی مقصد را انتخاب کنید.');
    if (!deviceId && !perRow)
      return setPreviewError('تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید.');
    if (pasteMode) {
      if (!pastedText.trim()) return setPreviewError('لیست را از اکسل کپی و اینجا بچسبانید.');
      setPreviewBusy(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/serial-import/preview-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            text: pastedText,
            project_id: projectId,
            device_id: deviceId || undefined,
            create_per_row: perRow,
            create_catalog: createCatalog,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
        setPreview(data.preview as ImportPreview);
      } catch (err) {
        setPreview(null);
        setPreviewError((err as Error).message);
      } finally {
        setPreviewBusy(false);
      }
      return;
    }
    if (!file) return setPreviewError('برای پیش‌نمایش، ابتدا فایل اکسل را انتخاب کنید.');

    setPreviewBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('project_id', String(projectId));
      if (deviceId) fd.append('device_id', String(deviceId));
      if (perRow) fd.append('create_per_row', '1');
      fd.append('create_catalog', createCatalog ? '1' : '0');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/serial-import/preview', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
      setPreview(data.preview as ImportPreview);
    } catch (err) {
      setPreview(null);
      setPreviewError((err as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!projectId) return setError('ابتدا پروژه‌ی مقصد را انتخاب کنید.');
    if (!deviceId && !perRow)
      return setError('تجهیز مقصد را انتخاب کنید یا گزینه‌ی «هر ردیف = یک دستگاه» را فعال کنید.');
    if (!file && !pasteMode) return setError('فایل اکسل را انتخاب کنید.');

    // حالت چسباندن لیست — مسیر JSON بدون فایل
    if (pasteMode) {
      if (!pastedText.trim()) return setError('لیست را از اکسل کپی و اینجا بچسبانید.');
      setBusy(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/serial-import/text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            text: pastedText,
            project_id: projectId,
            device_id: deviceId || undefined,
            create_per_row: perRow,
            create_catalog: createCatalog,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
        setResult(data as ImportResult);
        setPreview(null);
        setPastedText('');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('project_id', String(projectId));
      if (deviceId) fd.append('device_id', String(deviceId));
      if (perRow) fd.append('create_per_row', '1');
      fd.append('create_catalog', createCatalog ? '1' : '0');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/serial-import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
      setResult(data as ImportResult);
      setPreview(null);
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

      {/* راهنمای قالب — جداکننده‌ی نقطه‌چین */}
      <details className="card card-accent" open={!result}>
        <summary className="cursor-pointer font-bold text-brand-700 dark:text-brand-200 border-b-2 border-dashed border-brand-100 dark:border-brand-800 pb-2 mb-3">
          قالب فایل (مطابق فهرست قطعات انبار)
        </summary>
        <ul className="list-disc pr-5 space-y-1 text-sm leading-6 text-brand-800 dark:text-brand-200">
          <li><b>قالب جدید (توصیه‌شده):</b> هر ردیف = یک قطعه — ستون‌ها: سریال تجهیز، نوع قطعه، عنوان قطعه، پارت‌نامبر، سریال قطعه، مشخصات فنی. این قالب صریحاً می‌گوید هر قطعه روی کدام دستگاه نصب است.{' '}
            <button type="button" onClick={downloadTemplate} disabled={templateBusy} className="underline text-brand-600 dark:text-brand-300 font-bold">
              {templateBusy ? '...' : 'دانلود فایل نمونه'}
            </button>
          </li>
          <li><b>قالب قدیمی (فهرست انبار):</b> ردیف ۱ عنوان، ردیف ۲ توضیحات، ردیف ۳ پارت‌نامبر، ردیف ۴ به بعد سریال‌ها (هر ردیف = یک دستگاه). این قالب هم پذیرفته می‌شود و به‌صورت خودکار شناسایی می‌گردد.</li>
        </ul>
        <p className="text-xs text-brand-500 dark:text-brand-300/80 leading-5 mt-2">
          اگر پارت‌نامبری در دستگاه مقصد وجود نداشته باشد، قطعه‌ی جدید با همان عنوان و پارت‌نامبر
          روی دستگاه مقصد ساخته می‌شود. هیچ داده‌ای حذف نمی‌شود. پیش از ثبت، «پیش‌نمایش» را بزنید
          تا دقیقاً ببینید چه اتفاقی می‌افتد.
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
                setPreview(null);
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
              onChange={(e) => {
                setDeviceId(e.target.value ? Number(e.target.value) : '');
                setPreview(null);
              }}
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
                  setPreview(null);
                }}
                className="w-4 h-4 accent-brand-500"
              />
              هر ردیف اکسل = یک دستگاه جدید (برای فایل‌های چنددستگاهه مثل فهرست انبار)
            </label>
          </div>
        </div>

        {/* انتخاب روش ورود: فایل یا چسباندن لیست */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setPasteMode(false); setPreview(null); }}
            className={!pasteMode ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            📄 فایل اکسل
          </button>
          <button
            type="button"
            onClick={() => { setPasteMode(true); setFile(null); setPreview(null); }}
            className={pasteMode ? 'chip chip-active cursor-pointer' : 'chip chip-default cursor-pointer hover:bg-surface-raised dark:hover:bg-stone-700'}
          >
            📋 چسباندن لیست (بدون فایل)
          </button>
        </div>

        {/* گزینه‌ی ساخت مرجع کاتالوگ برای پارت‌نامبرهای ناشناس */}
        <label className="flex items-start gap-2 text-xs text-brand-600 dark:text-brand-300 cursor-pointer select-none rounded-xl bg-gold/5 border border-gold/25 px-3 py-2">
          <input
            type="checkbox"
            checked={createCatalog}
            onChange={(e) => { setCreateCatalog(e.target.checked); setPreview(null); }}
            className="w-4 h-4 mt-0.5 accent-brand-500"
          />
          <span className="leading-5">
            <b>🧩 ساخت مرجع کاتالوگ برای پارت‌نامبرهای ناشناس</b> — پارت‌نامبرهایی که در سامانه نیستند،
            با «عنوان قطعه» و «مشخصات/توضیحات» همین فایل به‌عنوان مرجع کاتالوگ ثبت می‌شوند تا همه‌ی قطعات
            هم‌پارت‌نامبر آینده اطلاعات یکسان بگیرند.
          </span>
        </label>

        {/* نوار مقصد انتخاب‌شده */}
        {(selectedDevice || perRow) && (
          <div className="rounded-2xl bg-surface-card border-2 border-stone-200 px-4 py-3 text-sm text-stone-800 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100">
            <span className="font-bold">مقصد:</span> {selectedProject?.name}
            {perRow ? (
              <>
                <span className="mx-2 text-stone-300 dark:text-stone-600">|</span>
                حالت چنددستگاهه: ردیف‌های دارای سریال دستگاه (ستون Case) دستگاه جدید می‌سازند
              </>
            ) : (
              <>
                {' ← '}{selectedDevice!.device_type_name}
                {selectedDevice!.brand_name ? ` (${selectedDevice!.brand_name})` : ''}
                <span className="mx-2 text-stone-300 dark:text-stone-600">|</span>
                سریال فعلی: <span dir="ltr" className="font-bold">{selectedDevice!.main_serial || '—'}</span>
                <span className="mx-2 text-stone-300 dark:text-stone-600">|</span>
                <Link to={`/devices/${selectedDevice!.id}`} className="underline text-brand-600 dark:text-brand-300">
                  مشاهده‌ی تجهیز
                </Link>
              </>
            )}
          </div>
        )}

        {pasteMode ? (
          <div>
            <label className="label">۳) لیست را از اکسل کپی و اینجا بچسبانید (Ctrl+V)</label>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              dir="ltr"
              placeholder={'عنوان قطعه\tپارت‌نامبر\tسریال قطعه\tمشخصات فنی\n32GB DDR4\t840758-001\t5CD1234568\tPC4-2666\nPSU 800W\tP19776-B21\t5CD9999999\t800W Platinum'}
              value={pastedText}
              onChange={(e) => { setPastedText(e.target.value); setPreview(null); }}
            />
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 leading-5">
              هر ردیف = یک قطعه · جداکننده: Tab (کپی مستقیم از اکسل)، | یا ؛ · سرستون اختیاری:
              سریال تجهیز | نوع قطعه | عنوان قطعه | پارت‌نامبر | سریال قطعه | مشخصات فنی
            </p>
          </div>
        ) : (
          <div>
            <label className="label">۳) فایل اکسل (xlsx / xls)</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="input"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </div>
        )}

        {error && (
          <Alert variant="danger">{error}</Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={runPreview}
            disabled={previewBusy || busy || !projectId || (!deviceId && !perRow) || (!pasteMode && !file) || (pasteMode && !pastedText.trim())}
          >
            {previewBusy ? 'در حال تحلیل...' : '🔍 پیش‌نمایش (بدون ثبت)'}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || previewBusy || !projectId || (!deviceId && !perRow) || (!pasteMode && !file) || (pasteMode && !pastedText.trim())}
          >
            {busy ? 'در حال پردازش...' : pasteMode ? 'ثبت لیست چسبانده‌شده' : 'آپلود و به‌روزرسانی سریال‌ها'}
          </button>
        </div>
      </form>

      {previewError && <Alert variant="danger">{previewError}</Alert>}

      {preview && <PreviewPanel p={preview} />}

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
            {(s.catalogCreated ?? 0) > 0 && (
              <Stat label="🧩 مراجع کاتالوگ ساخته‌شده">{toFa(s.catalogCreated!)}</Stat>
            )}
          </div>
          {s.deviceSerialUpdated && (
            <p className="text-sm text-brand-600 dark:text-brand-300">
              ★ سریال اصلی دستگاه نیز به‌روزرسانی شد.
            </p>
          )}

          {/* توضیحات چندگانه — برای انتخاب توضیح درست */}
          {(result!.descConflicts?.length ?? 0) > 0 && (
            <Alert variant="info">
              توضیحات متفاوت برای یک پارت‌نامبر ({toFa(result!.descConflicts!.length)}): همگی در
              فیلد «مشخصات فنی» ذخیره شدند — در فهرست قطعات توضیح درست را انتخاب کنید.
              <ul className="space-y-1 text-xs mt-2">
                {result!.descConflicts!.map((dc) => (
                  <li key={dc.partNumber}>
                    <span dir="ltr" className="font-bold">{dc.partNumber}</span>{' '}({dc.title}):{' '}
                    <span dir="auto">{dc.descriptions.join(' ⟷ ')}</span>
                  </li>
                ))}
              </ul>
            </Alert>
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

// ---------- پنل پیش‌نمایش خشک ----------
const PREVIEW_STATUS_META: Record<PreviewColumnStatus, { label: string; cls: string }> = {
  matched: { label: 'تطبیق', cls: 'bg-success/10 text-success border-success/40' },
  new: { label: 'قطعه‌ی جدید', cls: 'bg-gold/15 text-[#8a6d00] dark:text-gold-light border-gold/40' },
  device_serial: { label: 'سریال اصلی دستگاه', cls: 'bg-sky/10 text-sky-dark dark:text-sky-light border-sky/40' },
};

const PREVIEW_ACTION_META: Record<PreviewActionKind, { label: string; cls: string }> = {
  update_part: { label: 'به‌روزرسانی قطعه', cls: 'bg-success/10 text-success border-success/40' },
  create_part: { label: 'ساخت قطعه‌ی جدید', cls: 'bg-gold/15 text-[#8a6d00] dark:text-gold-light border-gold/40' },
  set_main_serial: { label: 'سریال اصلی دستگاه', cls: 'bg-sky/10 text-sky-dark dark:text-sky-light border-sky/40' },
};

function PreviewPanel({ p }: { p: ImportPreview }) {
  return (
    <div className="card card-accent space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-2xl">🔍</span>
        <h2 className="font-extrabold text-brand-800 dark:text-brand-100">پیش‌نمایش خشک — هیچ داده‌ای تغییر نمی‌کند</h2>
        <span className="chip-active">پیش‌نمایش</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="فایل">{p.file}</Stat>
        <Stat label="ردیف‌های سریال">{toFa(p.rowsDetected)}</Stat>
        <Stat label="ستون‌ها">
          {toFa(p.columnsTotal)} (تطبیق {toFa(p.columnsMatched)} / جدید {toFa(p.columnsCreated)})
        </Stat>
        <Stat label="قطعات به‌روزرسانی‌شونده">{toFa(p.willUpdateParts)}</Stat>
        <Stat label="قطعات ساخته‌شونده">{toFa(p.willCreateParts)}</Stat>
        <Stat label="دستگاه‌های ساخته‌شونده">{toFa(p.willCreateDevices)}</Stat>
        {p.willCreateCatalog > 0 && (
          <Stat label="🧩 مراجع کاتالوگ ساخته‌شونده">{toFa(p.willCreateCatalog)}</Stat>
        )}
      </div>

      {p.willUpdateMainSerial && (
        <p className="text-sm text-sky-dark dark:text-sky-light">
          ★ سریال اصلی دستگاه نیز به‌روزرسانی خواهد شد.
        </p>
      )}

      {/* پیشنهاد مرجع کاتالوگ — پارت‌نامبرهای ناشناس با اطلاعات فایل */}
      {p.catalogSuggestions.length > 0 && (
        <Alert variant="info">
          🧩 پیشنهاد مرجع کاتالوگ ({toFa(p.catalogSuggestions.length)} پارت‌نامبر ناشناس):
          {' '}با ثبت این فایل، مراجع زیر ساخته می‌شوند تا اطلاعات همه‌ی قطعات هم‌پارت‌نامبر یکسان بماند.
          <ul className="space-y-1.5 mt-2">
            {p.catalogSuggestions.map((s) => (
              <li key={s.partNumber} className="rounded-xl bg-surface-card dark:bg-stone-800/70 border border-gold/30 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200" dir="ltr">{s.partNumber}</span>
                  <span className="font-bold" dir="auto">{s.title}</span>
                  {s.firstRow > 0 && (
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">ردیف {toFa(s.firstRow)}</span>
                  )}
                </div>
                {s.techSpecs && (
                  <p className="text-xs text-stone-600 dark:text-stone-300 mt-1" dir="auto">مشخصات: {s.techSpecs}</p>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {p.warnings.length > 0 && (
        <Alert variant="info">
          <ul className="space-y-1">
            {p.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* تطبیق ستون‌ها — ستون به ستون: تطبیق دارد / ساخته می‌شود / سریال دستگاه */}
      <div>
        <p className="font-bold text-sm text-brand-800 dark:text-brand-100 mb-2">تطبیق ستون‌ها:</p>
        <div className="space-y-2">
          {p.columns.map((c) => {
            const meta = PREVIEW_STATUS_META[c.status];
            return (
              <div
                key={c.colLetter}
                className="rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm flex flex-wrap items-center gap-2"
              >
                <span className="badge bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200" dir="ltr">
                  ستون {c.colLetter}
                </span>
                <span className="font-bold" dir="auto">{c.title}</span>
                <span dir="ltr" className="text-xs text-stone-500 dark:text-stone-400">{c.partNumber}</span>
                <span className={`badge border ${meta.cls}`}>{meta.label}</span>
                {c.status === 'matched' && (
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    ({c.matchedFrom === 'device' ? 'همین دستگاه' : 'کل سامانه'} · {toFa(c.existingCount)} قطعه موجود)
                  </span>
                )}
                {c.desc && (
                  <span className="text-xs text-stone-500 dark:text-stone-400 w-full" dir="auto">{c.desc}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* اقدام‌های ردیف‌به‌ردیف که در صورت تأیید اجرا خواهند شد */}
      <details>
        <summary className="cursor-pointer text-sm font-bold text-brand-700 dark:text-brand-200">
          اقدام‌های ردیف‌به‌ردیف ({toFa(p.actions.length)}{p.actionsTruncated ? '+' : ''})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-brand-600 dark:text-brand-300">
                <th className="text-right py-1.5 px-2">ردیف اکسل</th>
                <th className="text-right py-1.5 px-2">ستون</th>
                <th className="text-right py-1.5 px-2">پارت‌نامبر</th>
                <th className="text-right py-1.5 px-2">سریال</th>
                <th className="text-right py-1.5 px-2">اقدام</th>
                <th className="text-right py-1.5 px-2">مقصد</th>
              </tr>
            </thead>
            <tbody>
              {p.actions.map((a, i) => {
                const meta = PREVIEW_ACTION_META[a.action];
                return (
                  <tr key={i} className="border-t border-stone-100 dark:border-stone-700">
                    <td className="py-1.5 px-2">{toFa(a.row)}</td>
                    <td className="py-1.5 px-2" dir="ltr">{a.col}</td>
                    <td className="py-1.5 px-2" dir="ltr">{a.partNumber}</td>
                    <td className="py-1.5 px-2" dir="ltr">{a.serial}</td>
                    <td className="py-1.5 px-2">
                      <span className={`badge border ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="py-1.5 px-2" dir="auto">{a.target}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {p.actionsTruncated && (
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
            نمایش تا {toFa(p.actionsCap)} اقدام اول؛ بقیه در زمان ثبت اجرا می‌شوند.
          </p>
        )}
      </details>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-card dark:bg-stone-800/60 p-3 border border-stone-200 dark:border-stone-700">
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</p>
      <p className="font-bold text-stone-800 dark:text-stone-100 truncate" dir="auto">
        {children}
      </p>
    </div>
  );
}
