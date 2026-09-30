// ============================================================
// صفحه‌ی «درباره‌ی سامانه» — معرفی، امکانات، وضعیت لایسنس و تماس
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// همگام با داشبورد: بنر وضعیت سقف تجهیز + لینک پنل ساخت لایسنس (/issue)
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { toFa } from '../lib/date';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';

interface LicenseStatus {
  plan: string;
  plan_label: string;
  days_left: number | null;
  expired: boolean;
  licensed_to: string | null;
}

interface DeviceLimit {
  limit: number | null;
  used: number;
  remaining: number | null;
  is_trial: boolean;
  enforce: boolean;
  limit_reached?: boolean;
}

const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: '🖥️', title: 'مدیریت تجهیزات', desc: 'ثبت جامع دستگاه و قطعات، وضعیت، تاریخ انبار/تحویل با تقویم شمسی' },
  { icon: '🧩', title: 'کاتالوگ قطعات', desc: 'مرجع واحد پارت‌نامبرها با sync و merge خودکار و گرید جدولی' },
  { icon: '🔒', title: 'یکتایی سریال', desc: 'ایندکس یکتای سراسری، جست‌وجوی فوری و دیالوگ «صاحبان سریال»' },
  { icon: '🛡️', title: 'گارانتی و تعویض', desc: 'جریان مرحله‌ای تعویض، درخواست‌های گارانتی و ردیابی زنجیره‌ای' },
  { icon: '📊', title: 'گزارش‌ها و داشبورد', desc: 'روند ماهانه، پرخرابی‌ترین قطعات، خروجی اکسل و PNG' },
  { icon: '📥', title: 'ورود سریال از اکسل', desc: 'آپلود مقصددار با پیش‌نمایش، Paste چندردیفی و قالب قابل دانلود' },
  { icon: '🗄️', title: 'پشتیبان‌گیری خودکار', desc: 'بکاپ روزانه SQLite با نگهداری ۳۰ نسخه و push خارجی/S3' },
  { icon: '👥', title: 'نقش‌های پنج‌گانه', desc: 'مدیر/انباردار/فروش/فنی/فقط‌مشاهده با اعمال کامل روی API و UI' },
];

export default function AboutPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [version, setVersion] = useState('…');
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimit | null>(null);

  useEffect(() => {
    api.get<{ version: string }>('/version').then((r) => setVersion(r.version)).catch(() => setVersion('—'));
    api.get<LicenseStatus>('/license').then(setLicense).catch(() => setLicense(null));
    api.get<DeviceLimit>('/license/device-limit').then(setDeviceLimit).catch(() => setDeviceLimit(null));
  }, []);

  // وضعیت سقف — منطق مشترک با داشبورد
  const isTrial = !!deviceLimit?.is_trial;
  const limit = deviceLimit?.limit ?? null;
  const used = deviceLimit?.used ?? 0;
  const remaining = deviceLimit?.remaining ?? null;
  const enforce = !!deviceLimit?.enforce;
  const nearLimit = isTrial && enforce && limit !== null && remaining !== null && remaining <= 3;
  const reached = isTrial && enforce && limit !== null && remaining !== null && remaining <= 0;
  const usedPct = limit !== null ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* هدر معرفی */}
      <section className="card card-elevated card-accent p-6">
        <div className="flex items-start gap-4">
          <span className="w-14 h-14 rounded-xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-glow shrink-0">
            م
          </span>
          <div className="min-w-0">
            <h1 className="heading-display text-2xl font-bold text-stone-900 dark:text-stone-50">
              سامانه‌ی مدیریت تجهیزات و قطعات یدکی
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 leading-6">
              پلتفرم فارسی RTL برای ردیابی تجهیزات، قطعات یدکی، گارانتی و تأمین — با تقویم شمسی،
              کاتالوگ پارت‌نامبر، یکتایی سریال و گزارش‌های تحلیلی.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:border-brand-800" dir="ltr">
                v{version}
              </span>
              {license && (
                <span
                  className={`badge ${
                    license.expired
                      ? 'bg-coral/10 text-coral-dark dark:text-coral-light border border-coral/40'
                      : 'bg-success/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  }`}
                >
                  📄 لایسنس: {license.plan_label}
                  {license.days_left !== null && !license.expired && <> · {toFa(license.days_left)} روز</>}
                  {license.expired && ' · منقضی'}
                </span>
              )}
              {isTrial && limit !== null && (
                <span
                  className={`badge fa-nums ${
                    nearLimit
                      ? 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600'
                  }`}
                >
                  🖥️ {toFa(used)} / {toFa(limit)} تجهیز
                  {enforce && remaining !== null && ` · ${toFa(remaining)} باقی‌مانده`}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* وضعیت سقف تجهیز — همگام با داشبورد */}
      {isTrial && limit !== null && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="heading-display text-base font-bold text-stone-900 dark:text-stone-50">🖥️ سقف تجهیزات نسخه‌ی آزمایشی</h2>
            <span className={`badge fa-nums ${nearLimit ? 'bg-gold/15 text-gold-dark dark:text-gold-light border border-gold/40' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600'}`}>
              {toFa(used)} / {toFa(limit)}
            </span>
          </div>
          <div className="progress-track">
            <div
              className={`h-full rounded-full transition-all duration-200 ease-out ${nearLimit ? 'bg-gold' : 'bg-brand-500'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 fa-nums">
            {toFa(used)} تجهیز ثبت شده از {toFa(limit)}
            {enforce && remaining !== null && <> — {toFa(remaining)} باقی‌مانده</>}
            {!enforce && ' — سقف فقط گزارش می‌شود (TRIAL_LIMIT_ENFORCE خاموش)'}
          </p>
          {reached && (
            <Alert variant="danger" className="mt-3">
              سقف نسخه‌ی آزمایشی پر شده است{enforce ? ' — افزودن تجهیز جدید با ۴۰۲ رد می‌شود' : ''}.
              {isAdmin ? <> برای ارتقا، <Link to="/issue" className="underline font-semibold">کد لایسنس بسازید</Link> یا فعال کنید: <Link to="/license" className="underline font-semibold">ورود کد لایسنس</Link></> : ' — با مدیر سامانه تماس بگیرید.'}
            </Alert>
          )}
          {!reached && nearLimit && (
            <Alert variant="warning" className="mt-3">
              فقط <b className="fa-nums">{toFa(remaining ?? 0)}</b> تجهیز تا سقف باقی مانده —
              {isAdmin ? <> <Link to="/issue" className="underline font-semibold">ساخت کد لایسنس</Link> (پنل فروشنده) یا <Link to="/license" className="underline font-semibold">ورود کد</Link></> : ' برای ارتقا با مدیر سامانه تماس بگیرید.'}
            </Alert>
          )}
        </section>
      )}

      {/* امکانات */}
      <section>
        <h2 className="heading-display text-lg font-bold text-stone-900 dark:text-stone-50 mb-3">امکانات سامانه</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-lg shrink-0">
                  {f.icon}
                </span>
                <div>
                  <p className="text-sm font-bold text-stone-800 dark:text-stone-100">{f.title}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-5">{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* طراح + تماس */}
      <section className="card p-6">
        <h2 className="heading-display text-lg font-bold text-stone-900 dark:text-stone-50 mb-3">طراح و توسعه‌دهنده</h2>
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white text-lg font-bold">
            م
          </span>
          <div>
            <p className="text-base font-bold text-stone-800 dark:text-stone-100">میثم ایجادی / Meysam Ijadi</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5" dir="ltr">
              M.Ijadi@Hotmail.com · +98 902 296 4006
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <a href="mailto:M.Ijadi@Hotmail.com" className="btn-primary !min-h-[34px] text-xs">
            ✉️ تماس برای خرید/پشتیبانی
          </a>
          <a
            href="https://hub.docker.com/r/meysam8498/support-equipment-management"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary !min-h-[34px] text-xs"
          >
            🐳 Docker Hub
          </a>
          <a
            href="https://github.com/meysam8498/Support"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !min-h-[34px] text-xs"
          >
            🐙 گیت‌هاب
          </a>
          {isAdmin && (
            <>
              <Link to="/issue" className="btn-secondary !min-h-[34px] text-xs">
                🧾 پنل ساخت لایسنس
              </Link>
              <Link to="/license" className="btn-ghost !min-h-[34px] text-xs">
                🔑 ورود کد لایسنس
              </Link>
            </>
          )}
        </div>
        <p className="text-[11px] text-stone-400 mt-4 leading-5">
          این نرم‌افزار تحت لایسنس تجاری (Proprietary) منتشر می‌شود — استفاده‌ی داخلی کسب‌وکار مجاز،
          فروش و توزیع مجدد ممنوع. متن کامل: فایل LICENSE در مخزن.
        </p>
      </section>
    </div>
  );
}
