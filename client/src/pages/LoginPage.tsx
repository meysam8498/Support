// ============================================================
// صفحه‌ی ورود — سیستم طراحی Flip7 (تیل/طلایی/کرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// الهام از جعبه‌ی بازی Flip7: کارت‌های بادبزنی پشت لوگو،
// پارالوگرام کرم با چرخش، و ریبان رترو زیر عنوان.
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';

/** کارت‌های بادبزنی پشت لوگو — پنج کارت با چرخش‌های متقارن */
function FanCards() {
  const cards = [
    { rot: '-24deg', cls: 'bg-coral' },
    { rot: '-12deg', cls: 'bg-gold' },
    { rot: '0deg', cls: 'bg-brand-400' },
    { rot: '12deg', cls: 'bg-sky' },
    { rot: '24deg', cls: 'bg-coral-dark' },
  ];
  return (
    <div className="relative h-20 w-40 mx-auto" aria-hidden>
      {cards.map((c, i) => (
        <div
          key={i}
          className={`absolute left-1/2 top-0 h-20 w-14 -ml-7 rounded-lg border-[3px] border-brand-800 shadow-card ${c.cls}`}
          style={{ transform: `translateX(-50%) rotate(${c.rot})`, transformOrigin: 'bottom center' }}
        >
          {/* حباب عدد روی کارت، مثل کارت‌های Flip7 */}
          <span className="absolute inset-x-0 top-2 text-center text-white font-extrabold text-lg drop-shadow">
            {i + 3}
          </span>
        </div>
      ))}
    </div>
  );
}

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-surface-base to-brand-100 dark:from-[#0b2e2c] dark:via-[#0b3b37] dark:to-[#082423]">
      <div className="card w-full max-w-sm relative overflow-visible">
        {/* کارت‌های بادبزنی + لوگوی پارالوگرام */}
        <FanCards />
        <div className="-mt-6 mb-4 text-center" style={{ transform: 'rotate(-3deg)' }}>
          <span
            className="inline-block bg-cream border-[3px] border-brand-800 px-4 py-1 shadow-md"
            style={{ transform: 'skewX(-6deg)', borderRadius: 6 }}
          >
            <span className="text-2xl font-extrabold text-brand-700 tracking-widest dark:text-brand-100">
              تجهیزات
            </span>
            <span
              className="inline-block ml-2 text-4xl font-extrabold text-gold-dark"
              style={{
                transform: 'rotate(4deg)',
                textShadow: '2px 2px 0 #1e8c86, -1px -1px 0 #1e8c86, 1px -1px 0 #1e8c86, -1px 1px 0 #1e8c86',
              }}
            >
              ۷
            </span>
          </span>
        </div>

        {/* ریبان رترو زیر لوگو */}
        <div className="text-center mb-6">
          <span className="ribbon text-sm">{t.loginTitle}</span>
        </div>

        {error && (
          <p className="mb-4 p-3 bg-coral/10 text-coral-dark rounded-xl text-sm text-center border-2 border-coral/30 dark:text-coral-light">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">{t.username}</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="label">{t.password}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary w-full py-2.5">
            {t.loginBtn}
          </button>
        </form>
      </div>
    </div>
  );
}
