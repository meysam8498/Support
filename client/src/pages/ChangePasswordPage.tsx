// ============================================================
// تغییر رمز عبور — توسط خود کاربر (و تغییر اجباری رمز پیش‌فرض در اولین ورود)
// • رمز فعلی + رمز جدید + تکرار؛ اعتبارسنجی سمت کلاینت با حداقل مشترک سرور
// • پس از تغییر، سرور توکن تازه می‌دهد (نشست‌های قبلی باطل می‌شوند)
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/fa';
import Alert from '../components/Alert';
import appStrings from '../../../shared/app-strings.json';

type FieldErrors = { current?: string; next?: string; confirm?: string };

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const minLen = appStrings.credentials.minPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const fe: FieldErrors = {};
    if (!current) fe.current = 'رمز فعلی را وارد کنید.';
    if (!next) fe.next = 'رمز جدید را وارد کنید.';
    else if (next.length < minLen) fe.next = appStrings.credentials.msgPasswordShort;
    else if (next === current) fe.next = 'رمز جدید باید با رمز فعلی متفاوت باشد.';
    if (confirm !== next) fe.confirm = 'تکرار رمز جدید یکسان نیست.';
    setErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setBusy(true);
    try {
      const r = await api.post<{ token: string; user: User }>('/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      // توکن تازه جایگزین می‌شود؛ توکن قبلی سمت سرور باطل شد
      localStorage.setItem('token', r.token);
      setUser(r.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-glow mb-3" aria-hidden="true">
            🔑
          </span>
          <h1 className="heading-display text-xl font-bold text-stone-900 dark:text-stone-50">{t.changePasswordTitle}</h1>
          <p className="text-xs mt-1 text-stone-500 dark:text-stone-400 text-center max-w-xs">{t.changePasswordHint}</p>
        </div>

        <div className="card p-6">
          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="cp-current">{t.currentPassword}</label>
              <input
                id="cp-current"
                className={`input ${errors.current ? 'input-error' : ''}`}
                type="password"
                value={current}
                onChange={(e) => { setCurrent(e.target.value); if (errors.current) setErrors((f) => ({ ...f, current: undefined })); }}
                autoFocus
                autoComplete="current-password"
                aria-invalid={!!errors.current}
              />
              {errors.current && <p className="field-error">⚠ {errors.current}</p>}
            </div>
            <div>
              <label className="label" htmlFor="cp-new">{t.newPassword}</label>
              <input
                id="cp-new"
                className={`input ${errors.next ? 'input-error' : ''}`}
                type="password"
                value={next}
                onChange={(e) => { setNext(e.target.value); if (errors.next) setErrors((f) => ({ ...f, next: undefined })); }}
                autoComplete="new-password"
                aria-invalid={!!errors.next}
                aria-describedby="cp-new-hint"
              />
              <p id="cp-new-hint" className="text-[11px] text-stone-600 dark:text-stone-400 mt-1">
                حداقل {minLen} نویسه — {appStrings.credentials.msgPasswordShort}
              </p>
              {errors.next && <p className="field-error">⚠ {errors.next}</p>}
            </div>
            <div>
              <label className="label" htmlFor="cp-confirm">{t.confirmPassword}</label>
              <input
                id="cp-confirm"
                className={`input ${errors.confirm ? 'input-error' : ''}`}
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((f) => ({ ...f, confirm: undefined })); }}
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm && <p className="field-error">⚠ {errors.confirm}</p>}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t.loading : t.changePasswordBtn}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4 text-stone-500 dark:text-stone-400">
          {t.changePasswordSessionsNote}
        </p>
      </div>
    </div>
  );
}
