// ============================================================
// صفحه‌ی ورود — زبان طراحی PipelinePro (ایندیگو/زینک، Outfit + Vazirmatn)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ساختار: لنگر ایندیگو + هدر Outfit + خطای رنگی (قرمز فقط خطای واقعی)
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.login(username, password);
      localStorage.setItem('token', data.token);
      // نقش و نام کاربر بلافاصله در کل برنامه به‌روز شود (بدون نیاز به رفرش).
      setUser(data.user as User);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hasError = !!error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-sm">
        {/* لوگو — لنگر ایندیگو */}
        <div className="flex flex-col items-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-glow mb-3">
            م
          </span>
          <h1 className="heading-display text-2xl font-bold text-stone-900 dark:text-stone-50">
            {t.appName}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            مدیریت پروژه و تجهیزات
          </p>
        </div>

        {/* کارت ورود */}
        <div className="card !p-6">
          <h2 className="heading-display text-lg font-semibold text-stone-800 dark:text-stone-100 mb-4">
            {t.loginTitle}
          </h2>

          {error && (
            <div role="alert" className="form-banner-error mb-4">
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="login-username">{t.username}</label>
              <input
                id="login-username"
                className={`input ${hasError ? 'input-error' : ''}`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">{t.password}</label>
              <input
                id="login-password"
                className={`input ${hasError ? 'input-error' : ''}`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {/* تنها CTA اصلی این نما */}
            <button type="submit" className="btn-primary w-full">
              {t.loginBtn}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-4">
          طراح و توسعه‌دهنده: میثم ایجادی
        </p>
      </div>
    </div>
  );
}
