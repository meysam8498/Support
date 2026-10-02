// ============================================================
// صفحه‌ی ورود — زبان طراحی PipelinePro (ایندیگو/زینک، Outfit + Vazirmatn)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// • اعتبارسنجی سمت کلاینت: پیام فارسی زیر فیلد قبل از ارسال
// • تم تاریک متمایز: پس‌زمینه‌ی گرادیانی ایندیگو
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { t } from '../i18n/fa';
import Alert from '../components/Alert';

interface FieldErrors {
  username?: string;
  password?: string;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── اعتبارسنجی سمت کلاینت — پیام فارسی زیر هر فیلد، قبل از تماس با سرور ──
    const fe: FieldErrors = {};
    if (!username.trim()) fe.username = 'نام کاربری را وارد کنید.';
    else if (username.trim().length < 2) fe.username = 'نام کاربری حداقل ۲ نویسه است.';
    if (!password) fe.password = 'رمز عبور را وارد کنید.';
    else if (password.length < 4) fe.password = 'رمز عبور حداقل ۴ نویسه است.';
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) return;

    try {
      const data = await api.login(username.trim(), password);
      localStorage.setItem('token', data.token);
      // نقش و نام کاربر بلافاصله در کل برنامه به‌روز شود (بدون نیاز به رفرش).
      setUser(data.user as User);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hasError = !!error;
  const inputCls = (fe?: string) => `input ${fe || hasError ? 'input-error' : ''}`;

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 transition-colors duration-200 ${
        dark
          ? 'relative overflow-hidden bg-[radial-gradient(1100px_550px_at_50%_-12%,rgba(99,102,241,0.42),transparent),radial-gradient(750px_480px_at_88%_112%,rgba(6,182,212,0.16),transparent),linear-gradient(160deg,#101024_0%,#1e1b4b_55%,#312e81_100%)]'
          : 'bg-surface-base'
      }`}
    >
      {/* دکمه‌ی تغییر تم — گوشه‌ی بالا (خارج از کارت، در هر دو تم) */}
      <button
        onClick={toggleTheme}
        className={`absolute top-4 left-4 z-10 w-10 h-10 rounded-full border flex items-center justify-center text-lg transition-colors duration-150 ${
          dark
            ? 'border-indigo-500/40 bg-stone-900/70 text-indigo-200 hover:bg-stone-800/90 backdrop-blur-sm'
            : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 shadow-sm'
        }`}
        title={t.toggleTheme}
        aria-label={t.toggleTheme}
      >
        {dark ? '☀️' : '🌙'}
      </button>

      {/* هاله‌های تزئینی — فقط در تم تاریک (عمق گرادیان ایندیگو) */}
      {dark && (
        <>
          <span aria-hidden className="pointer-events-none absolute -top-28 -left-24 w-[26rem] h-[26rem] rounded-full bg-indigo-500/20 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 w-[24rem] h-[24rem] rounded-full bg-indigo-400/15 blur-3xl" />
        </>
      )}
      <div className="relative w-full max-w-sm">
        {/* لوگو — لنگر ایندیگو */}
        <div className="flex flex-col items-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-glow mb-3">
            م
          </span>
          <h1 className={`heading-display text-2xl font-bold ${dark ? 'text-white' : 'text-stone-900 dark:text-stone-50'}`}>
            {t.appName}
          </h1>
          <p className={`text-xs mt-1 ${dark ? 'text-indigo-200/80' : 'text-stone-500 dark:text-stone-400'}`}>
            مدیریت پروژه و تجهیزات
          </p>
        </div>

        {/* کارت ورود — در تاریک روی گرادیان */}
        <div className={dark ? 'card !p-6 !bg-stone-900/85 !border-indigo-500/30 backdrop-blur-md shadow-2xl shadow-indigo-950/50' : 'card !p-6'}>
          <h2 className="heading-display text-lg font-semibold text-stone-800 dark:text-stone-100 mb-4">
            {t.loginTitle}
          </h2>

          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="login-username">{t.username}</label>
              <input
                id="login-username"
                className={inputCls(fieldErrors.username)}
                value={username}
                onChange={(e) => { setUsername(e.target.value); if (fieldErrors.username) setFieldErrors((f) => ({ ...f, username: undefined })); }}
                autoFocus
                required
                autoComplete="username"
                aria-invalid={!!fieldErrors.username}
              />
              {fieldErrors.username && (
                <p className="field-error">⚠ {fieldErrors.username}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="login-password">{t.password}</label>
              <input
                id="login-password"
                className={inputCls(fieldErrors.password)}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
                required
                autoComplete="current-password"
                aria-invalid={!!fieldErrors.password}
              />
              {fieldErrors.password && (
                <p className="field-error">⚠ {fieldErrors.password}</p>
              )}
            </div>
            {/* تنها CTA اصلی این نما */}
            <button type="submit" className="btn-primary w-full">
              {t.loginBtn}
            </button>
          </form>
        </div>

        <p className={`text-center text-xs mt-4 ${dark ? 'text-stone-400' : 'text-stone-400 dark:text-stone-500'}`}>
          طراح و توسعه‌دهنده: میثم ایجادی
        </p>
      </div>
    </div>
  );
}
