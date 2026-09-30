// ============================================================
// صفحه‌ی لایسنس — وضعیت + پنل مدیریت ادمین + ورود کد + سوابق
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { useAuth } from '../context/AuthContext';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { gregorianToJalali, toFa } from '../lib/date';

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
  revoked?: boolean;
}

const PLANS = [
  { value: 'trial', label: '🧪 آزمایشی/رایگان', months: null as number | null },
  { value: 'month', label: '📅 یک‌ماهه', months: 1 },
  { value: 'quarter', label: '📅 سه‌ماهه', months: 3 },
  { value: 'half-year', label: '📅 شش‌ماهه', months: 6 },
  { value: 'year', label: '📅 یک‌ساله', months: 12 },
  { value: 'lifetime', label: '♾️ دائمی', months: null as number | null },
] as const;

const PLAN_MONTHS_FA: Record<string, string> = {
  month: '۱ ماه',
  quarter: '۳ ماه',
  'half-year': '۶ ماه',
  year: '۱۲ ماه',
  lifetime: 'دائمی',
};

const PLAN_LABELS: Record<string, string> = {
  trial: 'آزمایشی/رایگان',
  month: 'یک‌ماهه',
  quarter: 'سه‌ماهه',
  'half-year': 'شش‌ماهه',
  year: 'یک‌ساله',
  lifetime: 'دائمی',
};

export default function LicensePage() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  // ---------- ورود کد ----------
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // ---------- پنل مدیریت ادمین ----------
  const [plan, setPlan] = useState('trial');
  const [startsAt, setStartsAt] = useState('');
  const [licensedTo, setLicensedTo] = useState('');
  const [notes, setNotes] = useState('');
  // ---------- عمومی ----------
  const [error, setError] = useState('');
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // ---------- ابطال کد (ادمین) ----------
  const [revokedJtis, setRevokedJtis] = useState<string[]>([]);
  const [revokeJti, setRevokeJti] = useState('');
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);
  // ---------- ساخت لایسنس برای مشتری (صدور از پنل) ----------
  const [issPlan, setIssPlan] = useState('half-year');
  const [issTo, setIssTo] = useState('');
  const [issEmail, setIssEmail] = useState('');
  const [issNote, setIssNote] = useState('');
  const [issGrouped, setIssGrouped] = useState(true);
  const [issued, setIssued] = useState<{ jti: string; plan: string; plan_label: string; purchased_months: number | null; code: string; code_days: number; licensed_to: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.get<LicenseStatus>('/license');
      setStatus(s);
      setPlan(s.plan);
      setStartsAt(s.starts_at ? gregorianToJalali(s.starts_at) ?? '' : '');
      setLicensedTo(s.licensed_to ?? '');
      setNotes(s.notes ?? '');
      try {
        setActivations((await api.get<ActivationRow[]>('/license/activations')) ?? []);
      } catch {
        setActivations([]);
      }
      try {
        setRevokedJtis((await api.get<{ jtis: string[] }>('/license/revoked'))?.jtis ?? []);
      } catch {
        setRevokedJtis([]);
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const monthsOf = (p: string): number | null => PLANS.find((x) => x.value === p)?.months ?? null;

  // ---------- پنل مدیریت: ذخیره‌ی لایسنس (PUT) ----------
  const saveAdmin = async () => {
    setBusy(true); setError(''); setAdminMsg(null);
    try {
      const body: Record<string, unknown> = { plan, licensed_to: licensedTo || null, notes: notes || null };
      if (startsAt) body.starts_at = startsAt; // شمسی؛ پایان خودکار از طول طرح محاسبه می‌شود
      const r = await api.put<LicenseStatus>('/license', body);
      setAdminMsg(`✅ ذخیره شد — طرح «${r.plan_label}»${r.expires_at ? ` تا ${r.expires_at.slice(0, 10)}` : ' (بدون انقضا)'}`);
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- پنل مدیریت: تمدید از پایان فعلی ----------
  const extend = async (months: number) => {
    setBusy(true); setError(''); setAdminMsg(null);
    try {
      const r = await api.post<LicenseStatus>('/license/extend', { months, from_expiry: true });
      setAdminMsg(`✅ ${months} ماه تمدید شد — پایان جدید: ${r.expires_at?.slice(0, 10) ?? '—'}`);
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

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

  // ---------- ابطال کد (ادمین) ----------
  const doRevoke = async (unrevoke = false) => {
    const jti = revokeJti.trim();
    if (!jti) { setError('شناسه‌ی کد (jti) را وارد کنید.'); return; }
    setBusy(true); setError(''); setRevokeMsg(null);
    try {
      const r = await api.post<{ ok: boolean; jti: string; revoked_count: number }>(
        unrevoke ? '/license/unrevoke' : '/license/revoke',
        { jti }
      );
      setRevokeMsg(unrevoke
        ? `✅ ابطال «${r.jti}» لغو شد — این کد دوباره قابل فعال‌سازی است.`
        : `✅ کد «${r.jti}» باطل شد — فعال‌سازی‌های بعدی با آن ۴۰۳ می‌شود.`);
      setRevokeJti('');
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- ساخت لایسنس برای مشتری (صدور از پنل) ----------
  const issue = async () => {
    if (!issTo.trim() || issTo.trim().length < 2) { setError('نام دارنده‌ی لایسنس را وارد کنید.'); return; }
    setBusy(true); setError(''); setIssued(null); setCopied(false);
    try {
      const r = await api.post<{ jti: string; plan: string; plan_label: string; purchased_months: number | null; code: string; code_days: number; licensed_to: string }>(
        '/license/issue',
        {
          plan: issPlan,
          to: issTo.trim(),
          email: issEmail.trim() || null,
          note: issNote.trim() || null,
          grouped: issGrouped,
        }
      );
      setIssued(r);
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string; missing_key?: boolean } };
      setError(err.payload?.error || err.message);
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
      {/* ─────────── وضعیت فعلی ─────────── */}
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

      {/* ─────────── پنل مدیریت (فقط ادمین) ─────────── */}
      {isAdmin && status && (
        <section className="card p-5">
          <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-1">⚙️ مدیریت لایسنس</h2>
          <p className="text-xs text-stone-400 mb-4">
            طرح و بازه را مستقیم تنظیم کنید (مثلاً پس از پرداخت یا برای محیط تست). تاریخ پایان برای
            طرح‌های زمان‌دار خودکار از طول طرح محاسبه می‌شود؛ دائمی/آزمایشی بدون انقضا.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">طرح</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
                {PLANS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}{p.months ? ` — ${p.months} ماه` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">تاریخ شروع (شمسی)</label>
              <JalaliDatePicker label="" value={startsAt} onChange={setStartsAt} placeholder="۱۴۰۵/۰۷/۰۱" />
              {monthsOf(plan) && startsAt && (
                <p className="text-[11px] text-stone-400 mt-1">پایان خودکار: شروع + {monthsOf(plan)} ماه</p>
              )}
            </div>
            <div>
              <label className="label">ثبت‌شده برای (سازمان/شخص)</label>
              <input value={licensedTo} onChange={(e) => setLicensedTo(e.target.value)} className="input" placeholder="مثلاً: شرکت نمونه" />
            </div>
            <div>
              <label className="label">یادداشت / شماره فاکتور</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="اختیاری" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={saveAdmin} disabled={busy} className="btn-primary text-sm">💾 ذخیره</button>
            <button type="button" onClick={() => extend(1)} disabled={busy} className="btn-secondary text-sm">+۱ ماه تمدید</button>
            <button type="button" onClick={() => extend(3)} disabled={busy} className="btn-secondary text-sm">+۳ ماه</button>
            <button type="button" onClick={() => extend(12)} disabled={busy} className="btn-secondary text-sm">+۱۲ ماه</button>
          </div>
          {adminMsg && <div role="status" className="form-banner-success mt-3">✓ <span>{adminMsg}</span></div>}
          <p className="text-[11px] text-stone-400 mt-2">
            توجه: در نسخه‌ی فعلی محدودسازی انقضا فقط با متغیر محیطی <code className="font-mono" dir="ltr">LICENSE_ENFORCE=1</code> اعمال می‌شود؛ بدون آن، انقضا فقط هشدار است.
          </p>
        </section>
      )}

      {/* ─────────── ورود کد لایسنس ─────────── */}
      <section className="card p-5">
        <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-1">🔐 ورود کد لایسنس</h2>
        <p className="text-xs text-stone-400 mb-3 leading-6">
          کد فعال‌سازی دریافتی از فروشنده را وارد کنید. اعتبارسنجی کاملاً محلی و آفلاین است (تأیید امضا با
          کلید عمومی داخل سامانه). سفارش کد: M.Ijadi@Hotmail.com
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
        {error && <div role="alert" className="form-banner-error mt-3">⚠ <span>{error}</span></div>}
        {result && <div role="status" className="form-banner-success mt-3">✓ <span>{result}</span></div>}

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
            {revokedJtis.includes(preview.jti) && (
              <p className="text-coral text-xs font-bold pt-1">⛔ این کد باطل شده است — فعال‌سازی با پیام ۴۰۳ رد می‌شود.</p>
            )}
            <p className="text-xs text-stone-400 pt-1">برای ثبت نهایی، دکمه‌ی «🔓 فعال‌سازی» را بزنید.</p>
          </div>
        )}
      </section>

      {/* ─────────── سوابق فعال‌سازی ─────────── */}
      {activations.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-3">📜 سوابق فعال‌سازی</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-200 dark:border-stone-700">
                  <th className="text-right py-2 px-2">تاریخ فعال‌سازی</th>
                  <th className="text-right py-2 px-2">طرح</th>
                  <th className="text-right py-2 px-2">مدت</th>
                  <th className="text-right py-2 px-2">دارنده</th>
                  <th className="text-right py-2 px-2">شناسه‌ی کد</th>
                </tr>
              </thead>
              <tbody>
                {activations.map((a) => (
                  <tr key={a.id} className={`border-b border-stone-100 dark:border-stone-800 ${a.revoked ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-2 text-xs fa-nums">{a.activated_at?.replace('T', ' ').slice(0, 16) || '—'}</td>
                    <td className="py-2 px-2">{PLAN_LABELS[a.plan] ?? a.plan}{a.revoked && <span className="badge bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40 mr-1 text-[10px]">باطل‌شده</span>}</td>
                    <td className="py-2 px-2 text-xs text-stone-500 dark:text-stone-400 fa-nums">{PLAN_MONTHS_FA[a.plan] ?? '—'}</td>
                    <td className="py-2 px-2">{a.licensed_to || '—'}</td>
                    <td className="py-2 px-2 font-mono text-xs" dir="ltr">{a.jti}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────── ساخت لایسنس برای مشتری (فقط ادمین) ─────────── */}
      {isAdmin && (
        <section className="card p-5">
          <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-1">🧾 ساخت لایسنس برای مشتری</h2>
          <p className="text-xs text-stone-400 mb-4 leading-6">
            طرح و دارنده را وارد کنید و کد فعال‌سازی را همین‌جا بسازید تا برای مشتری بفرستید.
            کد فقط اینجا یک‌بار نمایش داده می‌شود — آن را کپی/دانلود و نگهداری کنید.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">طرح</label>
              <select value={issPlan} onChange={(e) => setIssPlan(e.target.value)} className="input">
                {PLANS.filter((p) => p.value !== 'trial').map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}{p.months ? ` — ${p.months} ماه` : ''}
                  </option>
                ))}
              </select>
              {monthsOf(issPlan) && (
                <p className="text-[11px] text-stone-400 mt-1">مدت خریداری‌شده: {monthsOf(issPlan)} ماه — از لحظه‌ی فعال‌سازی مشتری شروع می‌شود</p>
              )}
            </div>
            <div>
              <label className="label">دارنده‌ی لایسنس (سازمان/شخص)</label>
              <input value={issTo} onChange={(e) => setIssTo(e.target.value)} className="input" placeholder="مثلاً: شرکت نمونه" />
            </div>
            <div>
              <label className="label">ایمیل مشتری (اختیاری)</label>
              <input value={issEmail} onChange={(e) => setIssEmail(e.target.value)} className="input" dir="ltr" placeholder="info@company.ir" />
            </div>
            <div>
              <label className="label">یادداشت / شماره فاکتور (اختیاری)</label>
              <input value={issNote} onChange={(e) => setIssNote(e.target.value)} className="input" placeholder="مثلاً: فاکتور ۱۴۰۵-۰۰۱" />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-stone-600 dark:text-stone-300">
            <input type="checkbox" checked={issGrouped} onChange={(e) => setIssGrouped(e.target.checked)} className="accent-brand-500" />
            کد گروه‌بندی‌شده (بلوک‌های ۲۴ نویسه با جداکننده + — برای تایپ آسان)
          </label>
          <button type="button" onClick={issue} disabled={busy || !issTo.trim()} className="btn-primary text-sm mt-4">
            {busy ? '…' : '🧾 ساخت کد لایسنس'}
          </button>

          {issued && (
            <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-success/5 dark:bg-green-900/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="badge bg-green-50 text-success dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800 text-[10px]">
                  {issued.plan_label}
                </span>
                <span className="text-stone-600 dark:text-stone-300">
                  دارنده: <b>{issued.licensed_to}</b>
                  {issued.purchased_months !== null && <> · مدت خریداری‌شده: <b className="fa-nums">{toFa(issued.purchased_months)} ماه</b></>}
                  {issued.purchased_months === null && <> · مدت: <b>دائمی</b></>}
                  {' '}· اعتبار ورود کد: <b className="fa-nums">{toFa(issued.code_days)} روز</b>
                </span>
              </div>
              <p className="text-[11px] text-stone-400">شناسه‌ی کد: <code className="font-mono" dir="ltr">{issued.jti}</code> — برای پیگیری/ابطال نگه دارید</p>
              <textarea readOnly value={issued.code} rows={5} dir="ltr" className="input w-full font-mono text-xs leading-5 bg-white/60 dark:bg-black/20" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => { try { await navigator.clipboard.writeText(issued.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ } }}
                  className="btn-secondary text-sm"
                >
                  {copied ? '✓ کپی شد' : '📋 کپی کد'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([issued.code + '\n'], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `license-${issued.jti}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-secondary text-sm"
                >
                  ⬇️ دانلود فایل کد
                </button>
                <button type="button" onClick={() => setRevokeJti(issued.jti)} className="btn-ghost text-sm" title="پر کردن شناسه در بخش ابطال">
                  ⛔ پر کردن در ابطال
                </button>
              </div>
              <p className="text-xs text-stone-400">
                ارسال: کد را در فایل یا کانال امن بفرستید — مشتری از منوی «🔑 ورود کد لایسنس» آن را فعال می‌کند؛
                هر کد فقط یک‌بار و از لحظه‌ی فعال‌سازی شمارش می‌شود.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ─────────── ابطال کد (فقط ادمین) ─────────── */}
      {isAdmin && (
        <section className="card p-5">
          <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-50 mb-1">⛔ ابطال کد لایسنس</h2>
          <p className="text-xs text-stone-400 mb-3 leading-6">
            برای استرداد خرید یا سرقت کد، شناسه‌ی کد (jti) را از سوابق بالا (یا از <code dir="ltr" className="font-mono">--verify</code> فروشنده) بگیرید و ابطال کنید.
            کد باطل‌شده در این سامانه فعال نمی‌شود (۴۰۳)؛ ابطال با «لغو ابطال» برگشت‌پذیر است.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={revokeJti}
              onChange={(e) => setRevokeJti(e.target.value)}
              className="input max-w-xs font-mono text-xs"
              dir="ltr"
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
            <button type="button" onClick={() => doRevoke(false)} disabled={busy || !revokeJti.trim()} className="btn-primary text-sm">⛔ ابطال</button>
            <button type="button" onClick={() => doRevoke(true)} disabled={busy || !revokeJti.trim()} className="btn-secondary text-sm">↩ لغو ابطال</button>
          </div>
          {revokeMsg && <div role="status" className="form-banner-success mt-3">✓ <span>{revokeMsg}</span></div>}
          {revokedJtis.length > 0 && (
            <p className="text-xs text-stone-400 mt-2">
              کدهای باطل‌شده فعلی: {revokedJtis.map((j) => <code key={j} className="font-mono" dir="ltr">{j}</code>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, '، ', el] : [el]), [])}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
