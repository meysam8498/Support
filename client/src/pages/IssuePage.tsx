// ============================================================
// پنل ساخت لایسنس (فروشنده) — جدا از صفحه‌ی لایسنس مشتری
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// • فرم صدور: طرح/دارنده/ایمیل/فاکتور + کد گروه‌بندی‌شده
// • رجیستری کدهای صادرشده (ledger) + قالب پیام تحویل + فاکتور ساده
// مسیر: /issue — فقط ادمین (در منوی کاربر)
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api';
import { toFa } from '../lib/date';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';

interface IssuedResult {
  jti: string;
  plan: string;
  plan_label: string;
  purchased_months: number | null;
  licensed_to: string;
  code: string;
  code_days: number;
}

interface LedgerRow {
  id: number;
  jti: string;
  plan: string;
  licensed_to: string | null;
  email: string | null;
  note: string | null;
  code_days: number | null;
  issued_at: string | null;
  issued_by_name: string | null;
  activated: number;
}

const PLANS = [
  { value: 'month', label: '📅 یک‌ماهه — ۱ ماه', months: 1 },
  { value: 'quarter', label: '📅 سه‌ماهه — ۳ ماه', months: 3 },
  { value: 'half-year', label: '📅 شش‌ماهه — ۶ ماه', months: 6 },
  { value: 'year', label: '📅 یک‌ساله — ۱۲ ماه', months: 12 },
  { value: 'lifetime', label: '♾️ دائمی', months: null as number | null },
];

/** قیمت طرح‌ها به تومان — همگام با README */
const PLAN_PRICES: Record<string, string> = {
  month: '۴٫۹۰۰٫۰۰۰',
  quarter: '۱۲٫۵۰۰٫۰۰۰',
  'half-year': '۲۲٫۵۰۰٫۰۰۰',
  year: '۳۹٫۵۰۰٫۰۰۰',
  lifetime: '۹۹٫۰۰۰٫۰۰۰',
};

const PLAN_LABELS: Record<string, string> = {
  month: 'یک‌ماهه', quarter: 'سه‌ماهه', 'half-year': 'شش‌ماهه', year: 'یک‌ساله', lifetime: 'دائمی',
};

export default function IssuePage() {
  const { isAdmin } = useAuth();
  // ---------- فرم صدور ----------
  const [plan, setPlan] = useState('half-year');
  const [to, setTo] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [issued, setIssued] = useState<IssuedResult | null>(null);
  const [copied, setCopied] = useState<'code' | 'letter' | null>(null);
  // ---------- ledger ----------
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  // ---------- عمومی ----------
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLedger((await api.get<LedgerRow[]>('/license/issued')) ?? []);
      setError('');
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const issue = async () => {
    if (!to.trim() || to.trim().length < 2) { setError('نام دارنده‌ی لایسنس را وارد کنید.'); return; }
    setBusy(true); setError(''); setIssued(null); setCopied(null);
    try {
      const r = await api.post<IssuedResult>('/license/issue', {
        plan, to: to.trim(), email: email.trim() || null, note: note.trim() || null, grouped,
      });
      setIssued(r);
      setNote('');
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, which: 'code' | 'letter') => {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 2000); } catch { /* */ }
  };

  const download = (text: string, name: string) => {
    const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  /** قالب پیام تحویل کد به مشتری */
  const deliveryLetter = issued ? `
سلام؛

با تشکر از خرید شما. کد فعال‌سازی لایسنس «${issued.plan_label}» سامانه‌ی مدیریت تجهیزات و قطعات یدکی در پیوست ارسال می‌شود.

■ مشخصات لایسنس:
  • دارنده: ${issued.licensed_to}
  • طرح: ${issued.plan_label}${issued.purchased_months !== null ? ` (${toFa(issued.purchased_months)} ماه)` : ''}
  • شناسه‌ی کد: ${issued.jti}

■ راهنمای فعال‌سازی:
  1) وارد سامانه شوید (کاربر مدیر).
  2) از منوی کاربر (بالا-چپ) گزینه‌ی «🔑 ورود کد لایسنس» را باز کنید.
  3) کد را کامل کپی و در کادر بچسبانید (کد گروه‌بندی‌شده است؛ علامت + بخشی از کد است).
  4) «بررسی کد» → اطلاعات نمایش‌ داده‌شده را چک کنید → «🔓 فعال‌سازی».
  • اعتبار طرح از لحظه‌ی فعال‌سازی شروع می‌شود و فعال‌سازی آفلاین است؛ هیچ داده‌ای ارسال نمی‌شود.

■ پشتیبانی: M.Ijadi@Hotmail.com — 0902 296 4006

با احترام،
میثم ایجادی
`.trim() : '';

  /** فاکتور ساده */
  const invoiceText = issued ? `
فاکتور فروش لایسنس
────────────────────────────
فروشنده: میثم ایجادی — M.Ijadi@Hotmail.com — 0902 296 4006
خریدار:  ${issued.licensed_to}${email ? ` (${email})` : ''}
تاریخ:   ${new Date().toLocaleDateString('fa-IR')}
────────────────────────────
شرح:            لایسنس نرم‌افزار مدیریت تجهیزات و قطعات یدکی
طرح:            ${issued.plan_label}${issued.purchased_months !== null ? ` — ${toFa(issued.purchased_months)} ماه` : ''}
شناسه‌ی کد (jti): ${issued.jti}
مبلغ (تومان):    ${PLAN_PRICES[issued.plan] ?? '—'}
────────────────────────────
توضیح: کد فعال‌سازی پس از تسویه‌ی کامل ارسال شده است؛ اعتبار از لحظه‌ی فعال‌سازی مشتری آغاز می‌شود.
`.trim() : '';

  if (!isAdmin) {
    return <p className="p-8 text-center text-coral text-sm">این صفحه فقط برای مدیر سامانه است.</p>;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ─────────── فرم صدور ─────────── */}
      <section className="card card-elevated card-accent p-5">
        <h1 className="heading-display text-lg font-bold text-stone-900 dark:text-stone-50 mb-1">🧾 پنل ساخت لایسنس (فروشنده)</h1>
        <p className="text-xs text-stone-400 mb-4 leading-6">
          کد فعال‌سازی مشتری را اینجا بسازید — جدای از صفحه‌ی «ورود کد لایسنس» مشتری.
          کد فقط یک‌بار نمایش داده می‌شود؛ کپی/دانلود و نگهداری کنید. کلید خصوصی باید روی این سرور باشد
          (<code className="font-mono" dir="ltr">keys/license_private.pem</code> یا ENV <code className="font-mono" dir="ltr">LICENSE_ISSUE_KEY</code>).
        </p>
        {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">طرح</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
              {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="text-[11px] text-stone-400 mt-1">
              قیمت: {PLAN_PRICES[plan]} تومان — مدت خریداری‌شده: {PLANS.find((p) => p.value === plan)?.months ? `${toFa(PLANS.find((p) => p.value === plan)!.months!)} ماه` : 'دائمی'}
            </p>
          </div>
          <div>
            <label className="label">دارنده‌ی لایسنس (سازمان/شخص)</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="مثلاً: شرکت نمونه" />
          </div>
          <div>
            <label className="label">ایمیل مشتری (اختیاری)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" dir="ltr" placeholder="info@company.ir" />
          </div>
          <div>
            <label className="label">یادداشت / شماره فاکتور (اختیاری)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="مثلاً: فاکتور ۱۴۰۵-۰۰۱" />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="accent-brand-500" />
          کد گروه‌بندی‌شده (بلوک‌های ۲۴ نویسه با جداکننده + — برای تایپ آسان)
        </label>
        <button type="button" onClick={issue} disabled={busy || !to.trim()} className="btn-primary text-sm mt-4">
          {busy ? '…' : '🧾 ساخت کد لایسنس'}
        </button>
      </section>

      {/* ─────────── کد صادرشده + نامه + فاکتور ─────────── */}
      {issued && (
        <section className="card p-5 space-y-4">
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-success/5 dark:bg-green-900/20 p-4 space-y-3">
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
            <p className="text-[11px] text-stone-400">شناسه‌ی کد: <code className="font-mono" dir="ltr">{issued.jti}</code></p>
            <textarea readOnly value={issued.code} rows={5} dir="ltr" className="input w-full font-mono text-xs leading-5 bg-white/60 dark:bg-black/20" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copyText(issued.code, 'code')} className="btn-secondary text-sm">
                {copied === 'code' ? '✓ کپی شد' : '📋 کپی کد'}
              </button>
              <button type="button" onClick={() => download(issued.code, `license-${issued.jti}.txt`)} className="btn-secondary text-sm">⬇️ فایل کد</button>
            </div>
          </div>

          <details className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700 dark:text-stone-200">📨 قالب پیام تحویل به مشتری</summary>
            <textarea readOnly value={deliveryLetter} rows={14} className="input w-full text-xs leading-6 mt-2 bg-white/60 dark:bg-black/20" />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => copyText(deliveryLetter, 'letter')} className="btn-secondary text-sm">
                {copied === 'letter' ? '✓ کپی شد' : '📋 کپی پیام'}
              </button>
              <button type="button" onClick={() => download(deliveryLetter, `delivery-${issued.jti}.txt`)} className="btn-ghost text-sm">⬇️ دانلود</button>
            </div>
          </details>

          <details className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700 dark:text-stone-200">🧮 فاکتور ساده (متن)</summary>
            <textarea readOnly value={invoiceText} rows={12} className="input w-full text-xs leading-6 mt-2 bg-white/60 dark:bg-black/20" />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => copyText(invoiceText, 'letter')} className="btn-secondary text-sm">
                {copied === 'letter' ? '✓ کپی شد' : '📋 کپی فاکتور'}
              </button>
              <button type="button" onClick={() => download(invoiceText, `invoice-${issued.jti}.txt`)} className="btn-ghost text-sm">⬇️ دانلود</button>
            </div>
          </details>
        </section>
      )}

      {/* ─────────── رجیستری کدهای صادرشده ─────────── */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-display text-base font-bold text-stone-900 dark:text-stone-50">📚 کدهای صادرشده (رجیستری)</h2>
          <a href="/api/license/sales-export.csv" className="btn-secondary text-xs" title="خروجی CSV صدور/فعال‌سازی/ابطال برای حسابداری">📤 خروجی CSV فروش</a>
        </div>
        {ledger.length === 0 ? (
          <p className="text-sm text-stone-400">هنوز کدی از این پنل صادر نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-200 dark:border-stone-700">
                  <th className="text-right py-2 px-2">تاریخ صدور</th>
                  <th className="text-right py-2 px-2">طرح</th>
                  <th className="text-right py-2 px-2">دارنده</th>
                  <th className="text-right py-2 px-2">فاکتور/یادداشت</th>
                  <th className="text-right py-2 px-2">شناسه</th>
                  <th className="text-right py-2 px-2">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100 dark:border-stone-800">
                    <td className="py-2 px-2 text-xs fa-nums">{r.issued_at?.replace('T', ' ').slice(0, 16) || '—'}</td>
                    <td className="py-2 px-2">{PLAN_LABELS[r.plan] ?? r.plan}</td>
                    <td className="py-2 px-2">{r.licensed_to || '—'}</td>
                    <td className="py-2 px-2 text-xs">{r.note || '—'}</td>
                    <td className="py-2 px-2 font-mono text-xs" dir="ltr">{r.jti}</td>
                    <td className="py-2 px-2">
                      {r.activated
                        ? <span className="badge bg-green-50 text-success dark:bg-green-900/30 dark:text-green-300 text-[10px]">فعال‌شده</span>
                        : <span className="badge bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300 text-[10px]">صادرشده</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
