// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React, { useEffect, useState } from 'react';
import { api, type User } from '../api/api';
import { t } from '../i18n/fa';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [error, setError] = useState('');

  const [createForm, setCreateForm] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
  });

  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    active: 1,
  });

  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    try { setUsers(await api.get<User[]>('/users')); }
    catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 dark:text-slate-400">دسترسی به مدیریت کاربران فقط برای مدیر (admin) ممکن است.</p>
      </div>
    );
  }

  if (loading) return <p className="text-gray-400 dark:text-slate-500 text-center mt-20">{t.loading}</p>;

  const openCreate = () => {
    setCreateForm({ username: '', fullName: '', email: '', password: '', role: 'user' });
    setError('');
    setModalOpen(true);
  };

  const submitCreate = async () => {
    if (!createForm.username.trim() || !createForm.password.trim() || !createForm.fullName.trim()) {
      setError('نام کاربری، نام کامل و رمز عبور الزامی است.');
      return;
    }
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
    setError('');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
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
    if (!newPassword.trim()) { setError('رمز جدید الزامی است.'); return; }
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { new_password: newPassword });
      setResetTarget(null);
      setNewPassword('');
      setError('');
    } catch (e) { setError((e as Error).message); }
  };

  const remove = async (u: User) => {
    if (!confirm(`حذف کاربر «${u.fullName}»؟`)) return;
    try { await api.delete(`/users/${u.id}`); await load(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-xl font-bold dark:text-slate-100">{t.navUsers}</h1>
        <button onClick={openCreate} className="btn-primary text-sm">افزودن کاربر</button>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
              <th className="text-right px-3 py-2 font-medium">{t.fullName}</th>
              <th className="text-right px-3 py-2 font-medium">{t.username}</th>
              <th className="text-right px-3 py-2 font-medium">{t.email}</th>
              <th className="text-right px-3 py-2 font-medium">نقش</th>
              <th className="text-right px-3 py-2 font-medium">{t.active}</th>
              <th className="text-right px-3 py-2 font-medium">{t.actions}</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2 font-medium dark:text-slate-200">{u.fullName}</td>
                  <td className="px-3 py-2 fa-nums dark:text-slate-300" dir="ltr">{u.username}</td>
                  <td className="px-3 py-2 fa-nums dark:text-slate-300" dir="ltr">{u.email || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                      {u.role === 'admin' ? t.roleAdmin : t.roleUser}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`badge ${(u.active ?? 1) ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                      {(u.active ?? 1) ? t.active : t.inactive}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEdit(u)} className="text-brand-600 dark:text-brand-400 hover:underline text-xs">{t.edit}</button>
                      <button onClick={() => { setResetTarget(u); setNewPassword(''); setError(''); }} className="text-amber-600 dark:text-amber-400 hover:underline text-xs">{t.resetPassword}</button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => remove(u)} className="text-red-500 hover:underline text-xs">{t.delete}</button>
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
          {error && <p className="p-3 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg text-sm">{error}</p>}
          <div>
            <label className="label">{t.fullName}<span className="text-red-500 mr-1">*</span></label>
            <input className="input" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="label">{t.username}<span className="text-red-500 mr-1">*</span></label>
            <input className="input" dir="ltr" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
          </div>
          <div>
            <label className="label">{t.email}</label>
            <input className="input" dir="ltr" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          </div>
          <div>
            <label className="label">{t.password}<span className="text-red-500 mr-1">*</span></label>
            <input className="input" type="password" dir="ltr" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
          </div>
          <div>
            <label className="label">نقش</label>
            <select className="input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'user' })}>
              <option value="user">{t.roleUser}</option>
              <option value="admin">{t.roleAdmin}</option>
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
          {error && <p className="p-3 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg text-sm">{error}</p>}
          <div>
            <label className="label">{t.fullName}</label>
            <input className="input" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
          </div>
          <div>
            <label className="label">{t.email}</label>
            <input className="input" dir="ltr" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </div>
          <div>
            <label className="label">نقش</label>
            <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as 'admin' | 'user' })}>
              <option value="user">{t.roleUser}</option>
              <option value="admin">{t.roleAdmin}</option>
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
          {error && <p className="p-3 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg text-sm">{error}</p>}
          <div>
            <label className="label">رمز جدید<span className="text-red-500 mr-1">*</span></label>
            <input className="input" type="password" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
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
