// ============================================================
// صفحه‌ی ورود — سیستم طراحی Ember Studio (تراکوتا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// مینیمال و گرم: کارت سفید گرم روی پس‌زمینه‌ی کرم، لوگوی مربع تراکوتا،
// بدون تزئین اضافه — گرمای طراحی از خود پالت می‌آید.
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-sm">
        {/* لوگو */}
        <div className="flex flex-col items-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-glow mb-3">
            م
          </span>
          <h1 className="heading-serif text-2xl font-bold text-stone-900 dark:text-stone-50">
            {t.appName}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            مدیریت پروژه و تجهیزات
          </p>
        </div>

        {/* کارت ورود — سطح گرم، حاشیه‌ی ۱px استون */}
        <div className="card !p-6">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100 mb-4">
            {t.loginTitle}
          </h2>

          {error && (
            <p className="mb-4 p-3 rounded-lg bg-red-50 text-error text-sm border border-red-200 dark:bg-red-900/20 dark:border-red-900 dark:text-coral-light">
              {error}
            </p>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">{t.username}</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label">{t.password}</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
