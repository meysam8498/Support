// ============================================================
// بج وضعیت لایسنس در هدر — در همه‌ی صفحات دیده می‌شود
// • رنگ: سبز (پرداختی/سالم) · طلایی (آزمایشی با سقف فعال) · قرمز (منقضی)
// • کلیک → صفحه‌ی لایسنس (ادمین) — برای سایر کاربران title اطلاعاتی
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { toFa } from '../lib/date';
import { useAuth } from '../context/AuthContext';

interface LicenseLite {
  plan: string;
  plan_label: string;
  days_left: number | null;
  expired: boolean;
  licensed_to: string | null;
}

export default function LicenseBadge() {
  const [license, setLicense] = useState<LicenseLite | null>(null);
  const [trial, setTrial] = useState<{ is_trial: boolean; enforce: boolean } | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let alive = true;
    api.get<LicenseLite & { enforce?: boolean }>('/license')
      .then((s) => { if (alive) setLicense(s); })
      .catch(() => { /* بی‌صدا — بج فقط اطلاعاتی است */ });
    api.get<{ is_trial: boolean; enforce: boolean }>('/license/device-limit')
      .then((d) => { if (alive) setTrial(d); })
      .catch(() => { /* */ });
    return () => { alive = false; };
  }, []);

  if (!license) return null;

  const gold = license.plan === 'trial' && !!trial?.enforce;
  const cls = license.expired
    ? 'bg-coral/10 text-coral-dark dark:text-coral-light border-coral/40'
    : gold
      ? 'bg-gold/15 text-gold-dark dark:text-gold-light border-gold/40'
      : 'bg-success/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';

  const title = license.licensed_to
    ? `لایسنس سامانه — ثبت‌شده برای: ${license.licensed_to}`
    : 'وضعیت لایسنس سامانه';

  return (
    <button
      type="button"
      onClick={() => { if (user?.role === 'admin') navigate('/license'); }}
      className={`badge text-[10px] shrink-0 border cursor-pointer hover:opacity-80 transition-opacity ${cls} ${user?.role === 'admin' ? '' : 'cursor-default'}`}
      title={title}
    >
      📄 {license.plan_label}
      {license.days_left !== null && !license.expired && <> · <span className="fa-nums">{toFa(license.days_left)}</span> روز</>}
      {license.expired && ' · منقضی'}
    </button>
  );
}
