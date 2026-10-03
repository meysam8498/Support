// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { api, type User, type Role, ROLE_LABELS } from '../api/api';
import { t } from '../i18n/fa';
import Modal from '../components/Modal';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
// پیام‌ها/حداقل‌ها همگام با سرور (server/src/lib/validation.ts) — رشته‌های فارسی عیناً همان‌جا
const MSG_USERNAME_SHORT = 'نام کاربری حداقل ۲ نویسه است.';
const MSG_PASSWORD_SHORT = 'رمز عبور حداقل ۴ نویسه است.';

/** رنگ بج هر نقش */
const ROLE_CLS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  warehouse: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  sales: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  tech: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  viewer: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
};

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');

  const [createForm, setCreateForm] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'viewer' as Role,
  });

  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    role: 'viewer' as Role,
    active: 1,
  });

  const [newPassword, setNewPassword] = useState('');

  // خطاهای فیلدبه‌فیلد هر مدال — همان الگوی DeviceForm/PartForm
  const [createErrors, setCreateErrors] = useState<{ username?: string; fullName?: string; email?: string; password?: string }>({});
  const [editErrors, setEditErrors] = useState<{ fullName?: string; email?: string }>({});
  const [resetError, setResetError] = useState('');

  const load = async () => {
    try { setUsers(await api.get<User[]>('/users')); }
    catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">دسترسی به مدیریت کاربران فقط برای مدیر (admin) ممکن است.</p>
      </div>
    );
  }

  if (loading) return <p className="text-stone-400 dark:text-stone-500 text-center mt-20">{t.loading}</p>;

  const openCreate = () => {
    setCreateForm({ username: '', fullName: '', email: '', password: '', role: 'viewer' });
    setCreateErrors({});
    setError('');
    setModalOpen(true);
  };

  // پاک کردن خطای یک فیلد با تغییر همان فیلد
  const clearCreateError = (k: keyof typeof createErrors) =>
    setCreateErrors((f) => (f[k] ? { ...f, [k]: undefined } : f));

  const submitCreate = async () => {
    // ── اعتبارسنجی فیلد به فیلد — پیام فارسی زیر هر فیلد، قبل از تماس با سرور ──
    const fe: typeof createErrors = {};
    if (!createForm.fullName.trim()) fe.fullName = 'نام کامل الزامی است.';
    if (!createForm.username.trim()) fe.username = 'نام کاربری الزامی است.';
    else if (createForm.username.trim().length < 2) fe.username = MSG_USERNAME_SHORT;
    if (!createForm.password) fe.password = 'رمز عبور الزامی است.';
    else if (createForm.password.length < 4) fe.password = MSG_PASSWORD_SHORT;
    if (createForm.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(createForm.email.trim())) fe.email = 'ایمیل معتبر نیست.';
    setCreateErrors(fe);
    if (Object.keys(fe).length > 0) return;
    try {
      await api.post('/users', {
        username: createForm.username.trim(),
        full_name: createForm.fullName.trim(),
        email: createForm.email || undefined,
        password: createForm.password,
        role: createForm.role,
      });
      setModalOpen(false);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({
      fullName: u.fullName,
      email: u.email || '',
      role: u.role,
      active: u.active ?? 1,
    });
    setEditErrors({});
    setError('');
  };

  const clearEditError = (k: keyof typeof editErrors) =>
    setEditErrors((f) => (f[k] ? { ...f, [k]: undefined } : f));

  const submitEdit = async () => {
    if (!editTarget) return;
    const fe: typeof editErrors = {};
    if (!editForm.fullName.trim()) fe.fullName = 'نام کامل الزامی است.';
    if (editForm.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editForm.email.trim())) {
      fe.email = 'ایمیل معتبر نیست.';
    }
    setEditErrors(fe);
    if (Object.keys(fe).length > 0) return;
    try {
      await api.put(`/users/${editTarget.id}`, {
        full_name: editForm.fullName.trim(),
        email: editForm.email || undefined,
        role: editForm.role,
        active: editForm.active,
      });
      setEditTarget(null);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (!newPassword) { setResetError('رمز جدید الزامی است.'); return; }
    if (newPassword.length < 4) { setResetError(MSG_PASSWORD_SHORT); return; }
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { new_password: newPassword });
      setResetTarget(null);
      setNewPassword('');
      setResetError('');
      setError('');
    } catch (e) { setResetError((e as Error).message); }
  };

  const remove = async (u: User) => {
    if (!confirm(`حذف کاربر «${u.fullName}»؟`)) return;
    try { await api.delete(`/users/${u.id}`); await load(); }
    catch (e) { setPageError((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-xl font-bold dark:text-stone-50">{t.navUsers}</h1>
        <button onClick={openCreate} className="btn-primary text-sm">افزودن کاربر</button>
      </div>

      {pageError && <Alert variant="danger">{pageError}</Alert>}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-surface-card dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
              <th className="text-right px-3 py-2 font-medium">{t.fullName}</th>
              <th className="text-right px-3 py-2 font-medium">{t.username}</th>
              <th className="text-right px-3 py-2 font-medium">{t.email}</th>
              <th className="text-right px-3 py-2 font-medium">نقش</th>
              <th className="text-right px-3 py-2 font-medium">{t.active}</th>
              <th className="text-right px-3 py-2 font-medium">{t.actions}</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b dark:border-stone-700 hover:bg-surface-card dark:hover:bg-brand-900/25">
                  <td className="px-3 py-2 font-medium dark:text-stone-200">{u.fullName}</td>
                  <td className="px-3 py-2 fa-nums dark:text-stone-300" dir="ltr">{u.username}</td>
                  <td className="px-3 py-2 fa-nums dark:text-stone-300" dir="ltr">{u.email || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${ROLE_CLS[u.role] ?? ROLE_CLS.viewer}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`badge ${(u.active ?? 1) ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'}`}>
                      {(u.active ?? 1) ? t.active : t.inactive}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEdit(u)} className="text-brand-600 dark:text-brand-400 hover:underline text-xs">{t.edit}</button>
                      <button onClick={() => { setResetTarget(u); setNewPassword(''); setResetError(''); setError(''); }} className="text-amber-600 dark:text-amber-400 hover:underline text-xs">{t.resetPassword}</button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => remove(u)} className="text-coral hover:text-coral-dark text-xs">{t.delete}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* مدال افزودن کاربر */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="افزودن کاربر جدید">
        <div className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div>
            <label className="label">{t.fullName}<span className="text-coral mr-1">*</span></label>
            <input className={`input ${createErrors.fullName ? 'input-error' : ''}`} value={createForm.fullName}
              aria-invalid={!!createErrors.fullName}
              onChange={(e) => { clearCreateError('fullName'); setCreateForm({ ...createForm, fullName: e.target.value }); }} autoFocus />
            {createErrors.fullName && <p className="field-error">⚠ {createErrors.fullName}</p>}
          </div>
          <div>
            <label className="label">{t.username}<span className="text-coral mr-1">*</span></label>
            <input className={`input ${createErrors.username ? 'input-error' : ''}`} dir="ltr" value={createForm.username}
              aria-invalid={!!createErrors.username}
              onChange={(e) => { clearCreateError('username'); setCreateForm({ ...createForm, username: e.target.value }); }} />
            {createErrors.username && <p className="field-error">⚠ {createErrors.username}</p>}
          </div>
          <div>
            <label className="label">{t.email}</label>
            <input className={`input ${createErrors.email ? 'input-error' : ''}`} dir="ltr" value={createForm.email}
              aria-invalid={!!createErrors.email}
              onChange={(e) => { clearCreateError('email'); setCreateForm({ ...createForm, email: e.target.value }); }} />
            {createErrors.email && <p className="field-error">⚠ {createErrors.email}</p>}
          </div>
          <div>
            <label className="label">{t.password}<span className="text-coral mr-1">*</span></label>
            <input className={`input ${createErrors.password ? 'input-error' : ''}`} type="password" dir="ltr" value={createForm.password}
              aria-invalid={!!createErrors.password}
              onChange={(e) => { clearCreateError('password'); setCreateForm({ ...createForm, password: e.target.value }); }} />
            {createErrors.password && <p className="field-error">⚠ {createErrors.password}</p>}
          </div>
          <div>
            <label className="label">نقش</label>
            <select className="input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t.cancel}</button>
            <button onClick={submitCreate} className="btn-primary">{t.save}</button>
          </div>
        </div>
      </Modal>

      {/* مدال ویرایش کاربر */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="ویرایش کاربر">
        <div className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div>
            <label className="label">{t.fullName}<span className="text-coral mr-1">*</span></label>
            <input className={`input ${editErrors.fullName ? 'input-error' : ''}`} value={editForm.fullName}
              aria-invalid={!!editErrors.fullName}
              onChange={(e) => { clearEditError('fullName'); setEditForm({ ...editForm, fullName: e.target.value }); }} />
            {editErrors.fullName && <p className="field-error">⚠ {editErrors.fullName}</p>}
          </div>
          <div>
            <label className="label">{t.email}</label>
            <input className={`input ${editErrors.email ? 'input-error' : ''}`} dir="ltr" value={editForm.email}
              aria-invalid={!!editErrors.email}
              onChange={(e) => { clearEditError('email'); setEditForm({ ...editForm, email: e.target.value }); }} />
            {editErrors.email && <p className="field-error">⚠ {editErrors.email}</p>}
          </div>
          <div>
            <label className="label">نقش</label>
            <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t.active}</label>
            <select className="input" value={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: Number(e.target.value) })}>
              <option value={1}>{t.active}</option>
              <option value={0}>{t.inactive}</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditTarget(null)} className="btn-secondary">{t.cancel}</button>
            <button onClick={submitEdit} className="btn-primary">{t.save}</button>
          </div>
        </div>
      </Modal>

      {/* مدال بازنشانی رمز */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`${t.resetPassword} — ${resetTarget?.fullName || ''}`}>
        <div className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div>
            <label className="label">رمز جدید<span className="text-coral mr-1">*</span></label>
            <input className={`input ${resetError ? 'input-error' : ''}`} type="password" dir="ltr" value={newPassword}
              aria-invalid={!!resetError}
              onChange={(e) => { if (resetError) setResetError(''); setNewPassword(e.target.value); }} autoFocus />
            {resetError && <p className="field-error">⚠ {resetError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setResetTarget(null)} className="btn-secondary">{t.cancel}</button>
            <button onClick={submitReset} className="btn-primary">{t.save}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
