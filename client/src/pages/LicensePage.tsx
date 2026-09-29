// ============================================================
// صفحه‌ی ورود کد لایسنس — فعال‌سازی طرح با JWT امضاشده (RS256)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api';
import { t } from '../i18n/fa';

interface LicenseStatus {
  plan: string;
  plan_label: string;
  days_left: number | null;
  expired: boolean;
  licensed_to: string | null;
  notes: string | null;
  starts_at: string | null;
  expires_at: string | null;
}

interface CodePreview {
  valid: boolean;
  jti: string;
  plan: string;
  to: string | null;
  email: string | null;
  note: string | null;
  issued_at: number | null;
  expires_in_days: number | null;
  error?: string;
}

interface ActivationRow {
  id: number;
  jti: string;
  plan: string;
  licensed_to: string | null;
  email: string | null;
  note: string | null;
  activated_at: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'آزمایشی/رایگان',
  month: 'یک‌ماهه',
  quarter: 'سه‌ماهه',
  'half-year': 'شش‌ماهه',
  year: 'یک‌ساله',
  lifetime: 'دائمی',
};

export default function LicensePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.get<LicenseStatus>('/license');
      setStatus(s);
      try {
        const h = await api.get<ActivationRow[]>('/license/activations');
        setActivations(h ?? []);
      } catch {
        setActivations([]);
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const checkCode = async () => {
    const c = code.trim();
    if (!c) { setError('کد لایسنس را وارد کنید.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const p = await api.post<CodePreview>('/license/code-status', { code: c });
      setPreview(p);
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setPreview(null);
      setError(err.payload?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    const c = code.trim();
    if (!c) { setError('کد لایسنس را وارد کنید.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api.post<{ plan_label: string; licensed_to: string | null; days_left: number | null }>(
        '/license/activate',
        { code: c }
      );
      setResult(`✅ فعال‌سازی موفق — طرح «${PLAN_LABELS[r.plan_label] ?? r.plan_label}»${r.licensed_to ? ` برای ${r.licensed_to}` : ''}${r.days_left !== null ? ` · ${r.days_left} روز باقی‌مانده` : ''}`);
      setCode('');
      setPreview(null);
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string; already_used?: boolean } };
      setError(
        err.payload?.already_used
          ? 'این کد قبلاً استفاده شده است.'
          : err.payload?.error || err.message
      );
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* وضعیت فعلی */}
      <section className="card p-5">
        <h1 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-3">🔑 وضعیت لایسنس</h1>
        {loading ? (
          <p className="text-stone-400 text-sm">{t.loading}</p>
        ) : status ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-stone-400 text-xs mb-1">طرح فعلی</p>
              <span className={`badge ${status.expired ? 'bg-coral/10 text-coral' : 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                {status.plan_label}{status.expired ? ' (منقضی)' : ''}
              </span>
            </div>
            <div>
              <p className="text-stone-400 text-xs mb-1">ثبت‌شده برای</p>
              <p className="text-stone-700 dark:text-stone-200 font-medium">{status.licensed_to || '—'}</p>
            </div>
            <div>
              <p className="text-stone-400 text-xs mb-1">روز باقی‌مانده</p>
              <p className="text-stone-700 dark:text-stone-200 font-medium">
                {status.days_left !== null ? status.days_left.toLocaleString('fa-IR') : 'بدون محدودیت'}
              </p>
            </div>
            <div>
              <p className="text-stone-400 text-xs mb-1">شروع</p>
              <p className="text-stone-700 dark:text-stone-200">{fmtDate(status.starts_at)}</p>
            </div>
            <div>
              <p className="text-stone-400 text-xs mb-1">پایان</p>
              <p className="text-stone-700 dark:text-stone-200">{fmtDate(status.expires_at)}</p>
            </div>
          </div>
        ) : (
          <p className="text-coral text-sm">{error || t.noData}</p>
        )}
      </section>

      {/* ورود کد */}
      <section className="card p-5">
        <h2 className="text-base font-bold text-stone-800 dark:text-stone-100 mb-2">🔐 ورود کد لایسنس</h2>
        <p className="text-xs text-stone-400 mb-3 leading-6">
          کد فعال‌سازی را که از فروشنده دریافت کرده‌اید در کادر زیر وارد کنید. کد به‌صورت محلی و با
          کلید عمومی داخل سامانه اعتبارسنجی می‌شود (بدون نیاز به اینترنت) و پس از فعال‌سازی، سقف تجهیزات
          برداشته می‌شود. برای تهیه‌ی کد: M.Ijadi@Hotmail.com
        </p>
        <textarea
          value={code}
          onChange={(e) => { setCode(e.target.value); setPreview(null); }}
          placeholder="eyJhbGciOiJSUzI1NiIs…  (کد چندخطی/گروه‌بندی‌شده هم پذیرفته است)"
          rows={4}
          className="input w-full font-mono text-xs leading-5"
          dir="ltr"
        />
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={activate} disabled={busy} className="btn-primary text-sm">
            {busy ? '…' : '🔓 فعال‌سازی'}
          </button>
          <button type="button" onClick={checkCode} disabled={busy} className="btn-secondary text-sm">
            بررسی کد
          </button>
          <button type="button" onClick={() => { setCode(''); setPreview(null); setResult(null); setError(''); }} className="btn-ghost text-sm">
            پاک کردن
          </button>
        </div>
        {error && <p className="text-coral text-sm mt-3">⚠ {error}</p>}
        {result && <p className="text-green-600 dark:text-green-400 text-sm mt-3">{result}</p>}

        {preview && (
          <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/20 p-4 text-sm space-y-1.5">
            <p className="font-bold text-green-700 dark:text-green-300 mb-2">✔ امضا تأیید شد — اطلاعات کد:</p>
            <div className="grid grid-cols-2 gap-2 text-stone-700 dark:text-stone-200">
              <p>طرح: <b>{PLAN_LABELS[preview.plan] ?? preview.plan}</b></p>
              <p>دارنده: <b>{preview.to || '—'}</b></p>
              <p>شناسه‌ی کد: <span className="font-mono text-xs" dir="ltr">{preview.jti}</span></p>
              <p>اعتبار ورود کد: {preview.expires_in_days !== null ? `${preview.expires_in_days} روز` : '—'}</p>
              {preview.note && <p className="col-span-2">یادداشت: {preview.note}</p>}
            </div>
            <p className="text-xs text-stone-400 pt-1">برای ثبت نهایی، دکمه‌ی «🔓 فعال‌سازی» را بزنید.</p>
          </div>
        )}
      </section>

      {/* سوابق فعال‌سازی */}
      {activations.length > 0 && (
        <section className="card p-5">
          <h2 className="text-base font-bold text-stone-800 dark:text-stone-100 mb-3">📜 سوابق فعال‌سازی</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-200 dark:border-stone-700">
                  <th className="text-right py-2 px-2">تاریخ فعال‌سازی</th>
                  <th className="text-right py-2 px-2">طرح</th>
                  <th className="text-right py-2 px-2">دارنده</th>
                  <th className="text-right py-2 px-2">شناسه‌ی کد</th>
                </tr>
              </thead>
              <tbody>
                {activations.map((a) => (
                  <tr key={a.id} className="border-b border-stone-100 dark:border-stone-800">
                    <td className="py-2 px-2 text-xs">{a.activated_at?.replace('T', ' ').slice(0, 16) || '—'}</td>
                    <td className="py-2 px-2">{PLAN_LABELS[a.plan] ?? a.plan}</td>
                    <td className="py-2 px-2">{a.licensed_to || '—'}</td>
                    <td className="py-2 px-2 font-mono text-xs" dir="ltr">{a.jti}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
