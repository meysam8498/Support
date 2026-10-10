// ============================================================
// صفحه‌ی لایسنس خریدار — فقط وضعیت لایسنس فعلی + ورود کد
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ------------------------------------------------------------------
// تصمیم محصول (۱.۲۸): خریدار فقط لایسنس فعال خودش را می‌بیند.
//  — سوابق فعال‌سازی‌های قبلی، پنل مدیریت/تمدید و گزینه‌ی ابطال حذف شد؛
//    ابطال در انحصار فروشنده است (پنل /issue) و درخواست مشتری با ایمیل/تماس.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import Alert from '../components/Alert';

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
  // ---------- ورود کد ----------
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // ---------- عمومی ----------
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.get<LicenseStatus>('/license'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---------- ورود کد ----------
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
  const daysLeftBadge = status && (
    <span className={`badge ${status.expired ? 'bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40' : 'bg-success/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'}`}>
      {status.plan_label}{status.expired ? ' (منقضی)' : ''}
      {status.days_left !== null && !status.expired && <> · {status.days_left.toLocaleString('fa-IR')} روز باقی‌مانده</>}
    </span>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ─────────── وضعیت لایسنس فعلی ─────────── */}
      <section className="card card-elevated card-accent p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="font-display text-lg font-bold text-stone-900 dark:text-stone-50">🔑 وضعیت لایسنس</h1>
          {status && daysLeftBadge}
        </div>
        {loading ? (
          <p className="text-stone-400 text-sm">{t.loading}</p>
        ) : status ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-stone-400 text-xs mb-1">ثبت‌شده برای</p><p className="text-stone-700 dark:text-stone-200 font-medium truncate">{status.licensed_to || '—'}</p></div>
            <div><p className="text-stone-400 text-xs mb-1">شروع</p><p className="text-stone-700 dark:text-stone-200 fa-nums">{fmtDate(status.starts_at)}</p></div>
            <div><p className="text-stone-400 text-xs mb-1">پایان</p><p className="text-stone-700 dark:text-stone-200 fa-nums">{fmtDate(status.expires_at)}</p></div>
            <div><p className="text-stone-400 text-xs mb-1">یادداشت</p><p className="text-stone-700 dark:text-stone-200 truncate">{status.notes || '—'}</p></div>
          </div>
        ) : (
          <p className="text-coral text-sm">{error || t.noData}</p>
        )}
      </section>

      {/* ─────────── ورود کد لایسنس ─────────── */}
      <section className="card p-5">
        <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-1">🔐 ورود کد لایسنس</h2>
        <p className="text-xs text-stone-400 mb-3 leading-6">
          کد فعال‌سازی دریافتی از فروشنده را وارد کنید. اعتبارسنجی کاملاً محلی و آفلاین است (تأیید امضا با
          کلید عمومی داخل سامانه). سفارش کد و هرگونه درخواست (تمدید، استرداد، ابطال): M.Ijadi@Hotmail.com
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
          <button type="button" onClick={checkCode} disabled={busy} className="btn-secondary text-sm">بررسی کد</button>
          <button type="button" onClick={() => { setCode(''); setPreview(null); setResult(null); setError(''); }} className="btn-ghost text-sm">پاک کردن</button>
        </div>
        {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
        {result && <Alert variant="success" className="mt-3">{result}</Alert>}

        {preview && (
          <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-success/5 dark:bg-green-900/20 p-4 text-sm space-y-1.5">
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
    </div>
  );
}
