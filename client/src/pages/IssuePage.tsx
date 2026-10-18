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
  /** در لیست ابطال فروشنده است؟ — نمایش «ابطال‌شده» در رجیستری */
  revoked?: boolean;
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

interface KeysStatus {
  current_kid: string;
  accepted_kids: string[];
  accepted_count: number;
  has_issue_key: boolean;
}

interface RotationResult {
  ok: boolean;
  old_kid: string;
  new_kid: string;
  accepted_kids: string[];
  current_kid: string;
  rotated_at: string;
  guide: string[];
}

/** سطر تاریخچه‌ی چرخش‌ها — GET /license/keys/rotations (از rotations.jsonl) */
interface RotationHistoryEntry {
  rotated_at: string;
  old_kid: string;
  new_kid: string;
  archived_pub: string | null;
  /** فایل بایگانی عمومی قدیمی روی همین سرور موجود است */
  archive_ok: boolean;
  by?: string;
}

interface RotationHistory {
  path: string;
  exists: boolean;
  count: number;
  invalid_lines: number;
  current_kid: string | null;
  /** جدیدترین چرخش اول */
  rotations: RotationHistoryEntry[];
}

/** پاسخ POST /license/issue-test — کد آزمایشی با کلید جاری (بدون ثبت فروش) */
interface TestIssueResult {
  ok: boolean;
  code: string;
  jti: string;
  /** kid کلید امضاکننده در هدر کد */
  kid: string | null;
  verified: boolean;
  expires_in_min: number;
  note?: string;
}

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
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  // ---------- چرخش کلید امضا (۱.۲۹) ----------
  const [keys, setKeys] = useState<KeysStatus | null>(null);
  const [rotResult, setRotResult] = useState<RotationResult | null>(null);
  const [rotBusy, setRotBusy] = useState(false);
  const [rotError, setRotError] = useState('');
  /** تاریخچه چرخش‌ها از رجیستری rotations.jsonl */
  const [rotHistory, setRotHistory] = useState<RotationHistory | null>(null);
  /** کد آزمایشی با کلید جاری/جدید — تست صدور بلافاصله بعد از چرخش */
  const [testIssue, setTestIssue] = useState<TestIssueResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState('');
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

  // ---------- چرخش کلید: وضعیت + عملیات ----------
  const loadKeys = useCallback(async () => {
    try { setKeys(await api.get<KeysStatus>('/license/keys/status')); } catch { /* پنل چرخش اطلاع محور نیست */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try { setRotHistory(await api.get<RotationHistory>('/license/keys/rotations')); } catch { /* اطلاع‌محور — بدون خطا در UI */ }
  }, []);

  useEffect(() => { if (isAdmin) loadKeys(); }, [isAdmin, loadKeys]);
  useEffect(() => { if (isAdmin) loadHistory(); }, [isAdmin, loadHistory]);

  const rotateKeys = async () => {
    if (!window.confirm('چرخش کلید امضای لایسنس؟\n\n\u2022 جفت‌کلید جدید جای کلید فعلی می‌شود (صدور آینده با کلید جدید).\n\u2022 کلید قبلی بایگانی و همچنان برای تأیید کدهای صادرشده‌ی قبلی پذیرفته می‌ماند.\n\u2022 کدهای قبلی هیچ‌وقت باطل نمی‌شوند.\n\u2022 اگر بیش از یک سرور دارید باید فایل‌ها را همگام کنید (راهنما بعد از چرخش نمایش داده می‌شود).\n\nادامه می‌دهید؟')) return;
    setRotBusy(true); setRotError(''); setRotResult(null);
    try {
      const r = await api.post<RotationResult>('/license/keys/rotate');
      setRotResult(r);
      await loadKeys();
      await loadHistory(); // سطر تازه‌ی رجیستری بلافاصله نمایش داده شود
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setRotError(err.payload?.error || err.message);
    } finally {
      setRotBusy(false);
    }
  };

  /** کد آزمایشی با کلید جاری — بعد از چرخش، تأییدِ زنده‌ی این است که صدور با کلید جدید انجام می‌شود */
  const issueTestCode = async () => {
    setTestBusy(true); setTestError(''); setTestIssue(null);
    try {
      setTestIssue(await api.post<TestIssueResult>('/license/issue-test'));
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setTestError(err.payload?.error || err.message);
    } finally {
      setTestBusy(false);
    }
  };

  // ابطال/لغو ابطال — فقط از پنل فروشنده (در پنل خریدار حذف شد)
  const revokeRow = async (jti: string, undo: boolean) => {
    setRowBusy(true); setError(''); setRowMsg(null);
    try {
      const r = await api.post<{ ok: boolean; jti: string; license_stripped?: boolean }>(
        undo ? '/license/unrevoke' : '/license/revoke',
        { jti }
      );
      setRowMsg(undo
        ? `↩ ابطال «${r.jti}» لغو شد — کد دوباره معتبر است.`
        : `⛔ کد «${r.jti}» باطل شد${r.license_stripped ? ' و از لایسنس فعال این سامانه حذف شد' : ''}.`);
      await load();
    } catch (e) {
      const err = e as Error & { payload?: { error?: string } };
      setError(err.payload?.error || err.message);
    } finally {
      setRowBusy(false);
    }
  };

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

  // kid مورد انتظارِ کد آزمایشی: کلیدِ چرخش اخیر (new_kid) وگرنه کلید جاری
  const expectedKid = rotResult?.new_kid ?? keys?.current_kid ?? null;
  const kidMatches = !!testIssue && testIssue.verified && !!testIssue.kid && testIssue.kid === expectedKid;

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
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input" aria-label="طرح">
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
              <span className="badge bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800 text-[10px]">
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

      {/* ─────────── چرخش کلید امضا (فقط ادمین) ─────────── */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="heading-display text-base font-bold text-stone-900 dark:text-stone-50">🔐 کلید امضای لایسنس</h2>
          {keys && (
            <div className="flex items-center gap-2 text-xs">
              <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 text-[10px]" title="شناسه‌ی کلید جاری (fingerprint)">
                kid جاری: <span className="font-mono" dir="ltr">{keys.current_kid}</span>
              </span>
              <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 text-[10px]" title="تعداد کلیدهای عمومی پذیرفته‌شده برای تأیید">
                پذیرفته‌شده: <span className="fa-nums">{toFa(keys.accepted_count || keys.accepted_kids.length)}</span>
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-stone-400 mb-3 leading-6">
          اگر کلید خصوصی امضا لو رفته باشد یا برای شیفت دوره‌ای امنیتی، از همین پنل بدون SSH چرخش کنید:
          کلید جدید جایگزین و کلید قبلی بایگانی می‌شود؛ <b className="text-stone-500 dark:text-stone-300">کدهای قبلی تا پایان اعتبارشان معتبر می‌مانند</b>
          و صدور از این پنل بلافاصله با کلید جدید ادامه می‌یابد.
        </p>
        {rotError && <Alert variant="danger" className="mb-3">{rotError}</Alert>}
        <button type="button" onClick={rotateKeys} disabled={rotBusy} className="btn-danger text-sm">
          {rotBusy ? '…' : '🔄 چرخش کلید امضا'}
        </button>
        {rotResult && (
          <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-success/5 dark:bg-green-900/20 p-4 text-sm space-y-2">
            <p className="font-bold text-green-700 dark:text-green-300">✔ چرخش انجام شد — {new Date(rotResult.rotated_at).toLocaleString('fa-IR')}</p>
            <div className="grid grid-cols-2 gap-2 text-stone-700 dark:text-stone-200 text-xs">
              <p>کلید قبلی (بایگانی/پذیرفته‌شده): <span className="font-mono" dir="ltr">{rotResult.old_kid}</span></p>
              <p>کلید جدید (صدور جاری): <span className="font-mono" dir="ltr">{rotResult.new_kid}</span></p>
            </div>
            <details className="text-xs text-stone-500 dark:text-stone-300">
              <summary className="cursor-pointer font-semibold">راهنمای همگام‌سازی سرورها / مستندات</summary>
              <ul className="list-disc pr-5 mt-1 space-y-1 leading-6">
                {rotResult.guide.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </details>
          </div>
        )}

        {/* ─────────── تست صدور با کلید جدید (بلافاصله بعد از چرخش) ─────────── */}
        <div className="mt-4">
          <button type="button" onClick={issueTestCode} disabled={testBusy} className="btn-secondary text-sm">
            {testBusy ? '… در حال صدور' : '🧪 صدور کد آزمایشی با کلید جدید'}
          </button>
          {rotResult && !testIssue && (
            <span className="block mt-1.5 text-[11px] text-stone-400 leading-5">
              چرخش انجام شد — برای اطمینان از اینکه صدور با کلید جدید (kid={rotResult.new_kid}) انجام می‌شود، این دکمه را بزنید.
            </span>
          )}
        </div>
        {testError && <Alert variant="danger" className="mt-3">{testError}</Alert>}
        {testIssue && (
          <div className="mt-3 rounded-lg border border-brand-200 dark:border-brand-700/40 bg-brand-50/60 dark:bg-brand-900/20 p-4 text-sm space-y-2">
            <p className={`font-bold ${kidMatches ? 'text-green-700 dark:text-green-300' : 'text-gold-dark dark:text-gold-light'}`}>
              {kidMatches
                ? '✔ کد آزمایشی با کلید جدید صادر و تأیید شد'
                : testIssue.verified
                  ? '⚠ کد صادر و تأیید شد ولی kid با کلید مورد انتظار نمی‌خواند'
                  : '❌ تأیید امضا ناموفق'}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-stone-700 dark:text-stone-200">
              <p>kid هدر کد: <span className="font-mono" dir="ltr">{testIssue.kid ?? '—'}</span></p>
              <p>کلید مورد انتظار ({rotResult ? 'کلید جدید چرخش' : 'کلید جاری'}): <span className="font-mono" dir="ltr">{expectedKid ?? '—'}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
              {kidMatches ? (
                <span className="badge bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-[10px]">تطبیق kid ✓</span>
              ) : (
                <span className="badge bg-gold/10 text-gold-dark dark:text-gold-light border border-gold/40 text-[10px]">عدم تطابق kid</span>
              )}
              <span>شناسه: <code className="font-mono" dir="ltr">{testIssue.jti}</code></span>
              <span>· انقضای کد: <b className="fa-nums">{toFa(testIssue.expires_in_min)} دقیقه</b></span>
            </div>
            <textarea readOnly value={testIssue.code} rows={4} dir="ltr" className="input w-full font-mono text-xs leading-5 bg-white/60 dark:bg-black/20" />
            <button type="button" onClick={() => copyText(testIssue.code, 'code')} className="btn-ghost text-xs">
              {copied === 'code' ? '✓ کپی شد' : '📋 کپی کد آزمایشی'}
            </button>
            {testIssue.note && <p className="text-[11px] text-stone-400 leading-5">{testIssue.note}</p>}
          </div>
        )}

        {/* ─────────── تاریخچه چرخش‌ها (از rotations.jsonl) ─────────── */}
        <div className="mt-5 pt-4 border-t border-stone-200 dark:border-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">📜 تاریخچه چرخش‌ها</h3>
            {rotHistory && rotHistory.count > 0 && (
              <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 text-[10px]" title="تعداد سطرهای معتبر رجیستری keys/rotations.jsonl">
                <span className="fa-nums">{toFa(rotHistory.count)}</span> سطر ثبت‌شده
              </span>
            )}
          </div>
          {!rotHistory || rotHistory.count === 0 ? (
            <p className="text-xs text-stone-400 leading-6">
              {rotHistory && !rotHistory.exists
                ? 'رجیستری چرخش هنوز ساخته نشده است (keys/rotations.jsonl) — با اولین چرخش از همین پنل ثبت می‌شود.'
                : 'هنوز چرخشی ثبت نشده است.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-stone-400 border-b border-stone-200 dark:border-stone-700">
                      <th className="text-right py-2 px-2">تاریخ چرخش</th>
                      <th className="text-right py-2 px-2">کلید قدیمی</th>
                      <th className="text-right py-2 px-2">کلید جدید</th>
                      <th className="text-right py-2 px-2">بایگانی عمومی</th>
                      <th className="text-right py-2 px-2">منبع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotHistory.rotations.map((r, i) => (
                      <tr key={`${r.old_kid}-${i}`} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="py-2 px-2 fa-nums whitespace-nowrap">
                          {Number.isNaN(Date.parse(r.rotated_at)) ? '—' : new Date(r.rotated_at).toLocaleString('fa-IR')}
                        </td>
                        <td className="py-2 px-2 font-mono" dir="ltr">{r.old_kid}</td>
                        <td className="py-2 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono" dir="ltr">{r.new_kid}</span>
                            {r.new_kid === rotHistory.current_kid && (
                              <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 text-[10px]" title="کلید جاریِ صدور و تأیید">جاری</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          {r.archive_ok ? (
                            <span className="badge bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-[10px]" title={r.archived_pub || ''}>موجود</span>
                          ) : (
                            <span className="badge bg-gold/10 text-gold-dark dark:text-gold-light border border-gold/40 text-[10px]" title={r.archived_pub || 'فایل بایگانی پیدا نشد'}>مفقود</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-stone-500 dark:text-stone-400">{r.by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rotHistory.invalid_lines > 0 && (
                <p className="text-[11px] text-gold-dark dark:text-gold-light mt-2">
                  ⚠ {toFa(rotHistory.invalid_lines)} سطر خراب/ناقص در رجیستری نادیده گرفته شد.
                </p>
              )}
              <p className="text-[10px] text-stone-400 mt-2 font-mono truncate" dir="ltr" title="مسیر رجیستری روی سرور">{rotHistory.path}</p>
            </>
          )}
        </div>
      </section>

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
                  <th className="text-right py-2 px-2">عملیات</th>
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
                      {r.revoked
                        ? <span className="badge bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40 text-[10px]">ابطال‌شده</span>
                        : r.activated
                          ? <span className="badge bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-[10px]">فعال‌شده</span>
                          : <span className="badge bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300 text-[10px]">صادرشده</span>}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {r.revoked
                        ? <button type="button" onClick={() => revokeRow(r.jti, true)} disabled={rowBusy} className="btn-ghost text-xs">↩ لغو ابطال</button>
                        : <button type="button" onClick={() => revokeRow(r.jti, false)} disabled={rowBusy} className="btn-ghost text-xs text-coral hover:underline">⛔ ابطال</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rowMsg && <Alert variant="success" className="mt-3">{rowMsg}</Alert>}
      </section>
    </div>
  );
}
