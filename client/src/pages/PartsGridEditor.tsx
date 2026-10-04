// ============================================================
// ویرایشگر جدولی قطعات تجهیز — تجربه‌ی اکسل‌مانند
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • بعد از ثبت تجهیز، قطعات را لیستی/ردیفی اضافه می‌کنید
//   (Ctrl+Enter یا دکمه = ردیف جدید؛ Esc در سلول خالی آخر = حذف ردیف)
// • Enter = ردیف جدید، Tab = سلول بعدی — مثل اکسل
// • تاریخ فروش هر ردیف پیش‌فرض «تاریخ فروش تجهیز» است و قابل تغییر
// • ثبت نهایی با POST /api/parts/batch (تراکنشی)
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import {
  parseClipboardParts,
  rebuildRows,
  toGridRows,
  FIELD_LABELS,
  type ClipField,
  type ParsedClipboard,
} from '../lib/parseClipboard';
import CatalogAutocomplete from '../components/CatalogAutocomplete';

export interface GridPartRow {
  key: string;
  title: string;
  part_number_1: string;
  part_number_2: string;
  part_serial_number: string;
  tech_specs: string;
  sold_at_jalali: string; // خالی = تاریخ تجهیز
}

interface Props {
  deviceId: number;
  deviceSerial?: string | null;
  defaultSoldAt: string; // تاریخ فروش تجهیز
}

const newRow = (i: number, soldAt: string): GridPartRow => ({
  key: `r${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  part_number_1: '',
  part_number_2: '',
  part_serial_number: '',
  tech_specs: '',
  sold_at_jalali: soldAt,
});

export default function PartsGridEditor({ deviceId, deviceSerial, defaultSoldAt }: Props) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<GridPartRow[]>([newRow(0, defaultSoldAt)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [pastePreview, setPastePreview] = useState<ParsedClipboard | null>(null);

  /** چسباندن چندردیفی از اکسل → تجزیه و پیش‌نمایش */
  const handleClipboard = useCallback((text: string) => {
    const parsed = parseClipboardParts(text);
    if (!parsed) return; // paste تک‌سلولی عادی — رفتار پیش‌فرض
    setPastePreview(parsed);
  }, []);

  const addRow = useCallback(() => {
    setRows((rs) => [...rs, newRow(rs.length, defaultSoldAt)]);
    // فوکوس روی سلول عنوان ردیف جدید در رندر بعدی
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-grid-cell]');
      inputs[inputs.length - 6]?.focus(); // ۶ ستون × ردیف‌ها → عنوان ردیف آخر
    });
  }, [defaultSoldAt]);

  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const setCell = <K extends keyof GridPartRow>(key: string, field: K, value: GridPartRow[K]) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const filledCount = useMemo(
    () => rows.filter((r) => r.title.trim() || r.part_number_1.trim() || r.part_serial_number.trim()).length,
    [rows],
  );

  // تشخیص زنده‌ی سریال تکراری — هم درون گرید هم در برابر دیتابیس (کوئری debounce شده)
  const serialDupes = useMemo(() => {
    const seen = new Map<string, string>(); // serialUpper → rowKey اول
    const local = new Set<string>();
    for (const r of rows) {
      const s = r.part_serial_number.trim().toUpperCase();
      if (!s) continue;
      if (seen.has(s)) { local.add(s); local.add(seen.get(s)!); }
      else seen.set(s, r.key);
    }
    return local;
  }, [rows]);
  const [dbDupes, setDbDupes] = useState<Set<string>>(new Set());
  useEffect(() => {
    const serials = [...new Set(rows.map((r) => r.part_serial_number.trim()).filter(Boolean))];
    if (serials.length === 0) { setDbDupes(new Set()); return; }
    const token = localStorage.getItem('token') ?? '';
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(serials.map((s) =>
          fetch(`/api/parts/serial-check?serial=${encodeURIComponent(s)}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : { exists: false }))
            .catch(() => ({ exists: false }))
        ));
        const dupes = new Set<string>();
        results.forEach((x: any, i: number) => { if (x?.exists) dupes.add(serials[i].toUpperCase()); });
        setDbDupes(dupes);
      } catch { /* بی‌خطر */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [rows]);
  const isSerialDupe = (serial: string): boolean => {
    const s = serial.trim().toUpperCase();
    return !!s && (serialDupes.has(s) || dbDupes.has(s));
  };
  const hasDupeError = rows.some((r) => isSerialDupe(r.part_serial_number));

  // کلیدهای اکسل‌مانند داخل سلول‌ها
  const onCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowKey: string, isLastRow: boolean, isEmptyRow: boolean) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLastRow && isEmptyRow) return; // ردیف آخرِ خالی که تازه هست
      addRow();
    }
    if (e.key === 'Escape' && isLastRow && isEmptyRow && rows.length > 1) {
      e.preventDefault();
      const idx = rows.findIndex((r) => r.key === rowKey);
      removeRow(rowKey);
      requestAnimationFrame(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('[data-grid-cell]');
        inputs[Math.max(0, (idx - 1) * 6)]?.focus();
      });
    }
  };

  const submit = async () => {
    const valid = rows.filter((r) => r.title.trim());
    if (valid.length === 0) {
      setError('حداقل یک قطعه با عنوان وارد کنید.');
      return;
    }
    if (hasDupeError) {
      setError('سریال تکراری در لیست هست — هر سریال فقط یک بار در کل سامانه می‌تواند ثبت شود.');
      return;
    }
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      const res = await api.post<{ inserted: number }>('/parts/batch', {
        device_id: deviceId,
        parts: valid.map((r) => ({
          title: r.title.trim(),
          part_number_1: r.part_number_1.trim() || undefined,
          part_number_2: r.part_number_2.trim() || undefined,
          part_serial_number: r.part_serial_number.trim() || undefined,
          tech_specs: r.tech_specs.trim() || undefined,
          sold_at_jalali: r.sold_at_jalali || undefined, // خالی = تاریخ تجهیز در سرور
        })),
      });
      setOkMsg(`${toFa(res.inserted)} قطعه به تجهیز اضافه شد.`);
      setRows([newRow(0, defaultSoldAt)]);
      setTimeout(() => navigate(`/devices/${deviceId}`), 900);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">افزودن قطعات فقط برای مدیر مجاز است.</p>
      </div>
    );
  }

  // بدون bg پایه — رنگ خطای سلول (bg-red-50/bg-red-900) باید بتواند مستقیم اعمال شود
  const cellCls = 'w-full px-2 py-2 text-sm outline-none focus:bg-brand-50/70 dark:focus:bg-brand-900/25 rounded-md min-w-0';
  const isLast = (i: number) => i === rows.length - 1;
  const isEmptyRow = (r: GridPartRow) => !r.title.trim() && !r.part_number_1.trim() && !r.part_number_2.trim() && !r.part_serial_number.trim() && !r.tech_specs.trim();

  /** paste در هر سلول: اگر چندردیفی بود → دیالوگ تجزیه؛ وگرنه رفتار عادی */
  const onCellPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const isMulti = /[\n\r]/.test(text.trim()) || (text.includes('\t') && text.split('\t').length > 2);
    if (!isMulti) return; // paste تک‌مقداری — پیش‌فرض مرورگر
    e.preventDefault();
    handleClipboard(text);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* ---------- هدر ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔩</span>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">افزودن قطعات تجهیز</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {deviceSerial ? <>سریال تجهیز: <b className="fa-nums" dir="ltr">{deviceSerial}</b> · </> : null}
              تاریخ فروش پیش‌فرض ردیف‌ها: <b className="fa-nums">{defaultSoldAt ? formatJalaliShort(defaultSoldAt) : '—'}</b>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip chip-default fa-nums">{toFa(rows.length)} ردیف</span>
          <button type="button" onClick={addRow} className="btn-ghost min-h-[34px] text-xs">
            + ردیف (Ctrl+Enter)
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="danger">{error}</Alert>
      )}
      {okMsg && (
        <Alert variant="pending">{okMsg} — در حال بازگشت به تجهیز…</Alert>
      )}

      {/* ---------- گرید ---------- */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-raised dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 text-xs">
                <th className="w-10 px-2 py-3 font-semibold">#</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[160px]">عنوان قطعه *</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[130px]">پارت‌نامبر ۱</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[110px]">پارت‌نامبر ۲</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[150px]">سریال قطعه</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[150px]">تاریخ فروش</th>
                <th className="px-2 py-3 font-semibold text-right min-w-[160px]">مشخصات فنی</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.key}
                  className={`border-t border-dashed border-stone-200 dark:border-stone-700 transition-colors ${
                    i % 2 === 1 ? 'bg-stone-50/60 dark:bg-stone-800/30' : ''
                  } hover:bg-brand-50/40 dark:hover:bg-brand-900/15`}
                >
                  <td className="px-2 text-center text-[11px] text-stone-400 dark:text-stone-500 fa-nums">{toFa(i + 1)}</td>
                  <td className="px-1 py-1">
                    <input
                      data-grid-cell
                      className={cellCls}
                      value={r.title}
                      placeholder="مثلاً 32GB DDR4 RDIMM یا Paste از اکسل"
                      dir="auto"
                      onChange={(e) => setCell(r.key, 'title', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                      onPaste={onCellPaste}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CatalogAutocomplete
                      value={r.part_number_1}
                      placeholder="پارت‌نامبر… (از کاتالوگ)"
                      onPick={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? {
                        ...x,
                        part_number_1: v.part_number_1 || x.part_number_1,
                        title: v.title || x.title,
                        tech_specs: v.tech_specs || x.tech_specs,
                      } : x))}
                      onChange={(v) => setCell(r.key, 'part_number_1', v)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                      onPaste={onCellPaste}
                      cellAttr={{ 'data-grid-cell': '' }}
                      className={`${cellCls} fa-nums`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-grid-cell
                      className={`${cellCls} fa-nums`}
                      value={r.part_number_2}
                      dir="ltr"
                      onChange={(e) => setCell(r.key, 'part_number_2', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-grid-cell
                      className={`${cellCls} fa-nums ${isSerialDupe(r.part_serial_number) ? 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20' : ''}`}
                      value={r.part_serial_number}
                      dir="ltr"
                      title={isSerialDupe(r.part_serial_number) ? 'این سریال تکراری است — هر سریال فقط یک بار در کل سامانه ثبت می‌شود' : ''}
                      onChange={(e) => setCell(r.key, 'part_serial_number', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                    />
                  </td>
                  <td className="px-1 py-1 min-w-[130px]">
                    <input
                      data-grid-cell
                      className={`${cellCls} fa-nums`}
                      value={r.sold_at_jalali}
                      placeholder={defaultSoldAt || '1404/05/10'}
                      dir="ltr"
                      onChange={(e) => setCell(r.key, 'sold_at_jalali', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-grid-cell
                      className={cellCls}
                      value={r.tech_specs}
                      placeholder="PC4-2666 …"
                      dir="auto"
                      onChange={(e) => setCell(r.key, 'tech_specs', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r.key, isLast(i), isEmptyRow(r))}
                    />
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      disabled={rows.length === 1}
                      title="حذف ردیف"
                      className="text-stone-300 hover:text-coral dark:text-stone-600 dark:hover:text-coral-light transition-colors disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- راهنما و اکشن ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-stone-400 dark:text-stone-500 leading-5">
          <kbd className="border border-stone-300 dark:border-stone-600 rounded px-1">Enter</kbd> ردیف جدید ·
          <kbd className="border border-stone-300 dark:border-stone-600 rounded px-1 mr-1">Tab</kbd> سلول بعدی ·
          <kbd className="border border-stone-300 dark:border-stone-600 rounded px-1 mr-1">Esc</kbd> حذف ردیفِ خالی آخر ·
          تاریخ خالی هر ردیف = تاریخ فروش تجهیز
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(`/devices/${deviceId}`)} className="btn-secondary">
            {t.cancel}
          </button>
          <button type="button" onClick={submit} disabled={saving || filledCount === 0} className="btn-primary">
            {saving ? '...' : `ثبت ${toFa(filledCount)} قطعه`}
          </button>
        </div>
      </div>

      {pastePreview && (
        <PastePreviewDialog
          parsed={pastePreview}
          defaultSoldAt={defaultSoldAt}
          onClose={() => setPastePreview(null)}
          onApply={(newRows, append) => {
            setRows((rs) => {
              const base = append ? rs.filter((r) => r.title.trim() || r.part_number_1.trim() || r.part_serial_number.trim()) : [];
              return [...base, ...newRows, newRow(0, defaultSoldAt)];
            });
            setPastePreview(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * دیالوگ پیش‌نمایش paste — ردیف‌های تجزیه‌شده + نگاشت ستون‌ها که قابل اصلاح است.
 */
function PastePreviewDialog({
  parsed,
  defaultSoldAt,
  onClose,
  onApply,
}: {
  parsed: ParsedClipboard;
  defaultSoldAt: string;
  onClose: () => void;
  onApply: (rows: GridPartRow[], append: boolean) => void;
}) {
  const [mapping, setMapping] = useState<ClipField[]>(parsed.mapping);
  const [append, setAppend] = useState(true);

  // بازسازی زنده‌ی ردیف‌ها با نگاشت فعلی — کاربر فوراً نتیجه را می‌بیند
  const liveRows = useMemo(
    () => rebuildRows(parsed.rawCells, mapping, parsed.hadHeader),
    [parsed, mapping],
  );

  const fieldOptions: ClipField[] = ['device_serial', 'kind', 'title', 'part_number', 'part_serial', 'specs', 'ignore'];
  const mappedCount = (f: ClipField) => mapping.filter((m) => m === f).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-3xl w-full space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b-2 border-dashed border-brand-100 dark:border-brand-800 pb-3">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <h2 className="font-extrabold text-brand-800 dark:text-brand-100">چسباندن از اکسل — {toFa(parsed.rows.length)} ردیف تشخیص داده شد</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {parsed.hadHeader ? 'سرستون‌ها شناسایی و حذف شد · ' : ''}
              ستون‌ها را در صورت نیاز اصلاح کنید، سپس تأیید کنید.
            </p>
          </div>
        </div>

        {/* نگاشت ستون‌ها */}
        <div>
          <p className="text-xs font-bold text-stone-600 dark:text-stone-300 mb-2">نگاشت ستون‌های متن اصلی:</p>
          <div className="flex flex-wrap gap-2">
            {mapping.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-brand-100 dark:border-brand-800 px-2 py-1">
                <span className="text-[11px] text-stone-400 fa-nums">ستون {toFa(i + 1)}:</span>
                <select
                  className="input min-h-[28px] py-0.5 px-1.5 text-xs w-auto"
                  value={f}
                  onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? e.target.value as ClipField : x)))}
                >
                  {fieldOptions.map((opt) => (
                    <option key={opt} value={opt}>{FIELD_LABELS[opt]}</option>
                  ))}
                </select>
                {f !== 'ignore' && mappedCount(f) > 1 && (
                  <span className="text-[10px] text-gold-dark dark:text-gold-light" title="چند ستون به این فیلد مپ شده‌اند — به هم می‌چسبند">⧉</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* پیش‌نمایش ردیف‌ها */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-x-auto max-h-[280px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-raised dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 sticky top-0">
                <th className="px-2 py-2 text-right font-semibold">عنوان</th>
                <th className="px-2 py-2 text-right font-semibold">پارت‌نامبر</th>
                <th className="px-2 py-2 text-right font-semibold">سریال</th>
                <th className="px-2 py-2 text-right font-semibold">مشخصات</th>
              </tr>
            </thead>
            <tbody>
              {liveRows.map((r, i) => (
                <tr key={i} className="border-t border-dashed border-stone-100 dark:border-stone-700">
                  <td className="px-2 py-1.5 text-stone-800 dark:text-stone-100" dir="auto">{r.title || '—'}</td>
                  <td className="px-2 py-1.5 fa-nums text-stone-600 dark:text-stone-300" dir="ltr">{r.part_number_1 || '—'}</td>
                  <td className="px-2 py-1.5 fa-nums text-stone-600 dark:text-stone-300" dir="ltr">{r.part_serial_number || '—'}</td>
                  <td className="px-2 py-1.5 text-stone-600 dark:text-stone-300" dir="auto">{r.tech_specs || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} className="w-4 h-4 accent-brand-500" />
          به ردیف‌های فعلی اضافه شود (لغو انتخاب = جایگزینی همه)
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">{t.cancel}</button>
          <button
            onClick={() => onApply(toGridRows({ ...parsed, rows: liveRows }, defaultSoldAt), append)}
            disabled={liveRows.length === 0}
            className="btn-primary text-sm"
          >
            افزودن {toFa(liveRows.length)} ردیف
          </button>
        </div>
      </div>
    </div>
  );
}

/** نمایش کوتاه تاریخ شمسی (۱۴۰۴/۰۵/۱۰) */
function formatJalaliShort(j: string): string {
  return j || '—';
}
