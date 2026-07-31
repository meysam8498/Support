// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/api';
import { t } from '../i18n/fa';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 dark:from-slate-900 dark:to-slate-800">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-brand-800 dark:text-brand-300 mb-6">{t.loginTitle}</h1>
        {error && <p className="mb-4 p-3 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg text-sm text-center">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">{t.username}</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="label">{t.password}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary w-full py-2.5">{t.loginBtn}</button>
        </form>
        <p className="mt-4 text-xs text-center text-gray-400 dark:text-slate-500">حساب پیش‌فرض: admin / admin123</p>
      </div>
    </div>
  );
}
