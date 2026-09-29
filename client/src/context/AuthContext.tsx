// ============================================================
// Context احراز هویت — طراح: میثم ایجادی / Meysam Ijadi
// نقش‌های پنج‌گانه: admin / warehouse / sales / tech / viewer.
// متمرکزسازی کاربر فعلی + پرچم‌های گیتینگ رابط کاربری.
// ============================================================
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '../api/api';

export type Role = 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  /** نقش کاربر فعلی (fallback: viewer) */
  role: Role;
  /** اجازه‌ی نوشتن عمومی (تجهیز/قطعه/کاتالوگ/لیست‌ها/تأمین/ورود سریال) */
  canWrite: boolean;
  /** ثبت درخواست گارانتی (فروش هم اجازه دارد) */
  canRequestWarranty: boolean;
  /** ثبت تعویض گارانتی (فقط فنی/ادمین) */
  canReplace: boolean;
  setUser: (u: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(readUser);

  // همگام‌سازی با تغییرات localStorage (مثلاً خروج از تب دیگر)
  useEffect(() => {
    const handler = () => setUserState(readUser());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem('user', JSON.stringify(u));
    } else {
      localStorage.removeItem('user');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUserState(null);
  };

  const role: Role = (user?.role as Role) ?? 'viewer';
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      isAdmin: role === 'admin',
      canWrite: role === 'admin' || role === 'warehouse' || role === 'tech',
      canRequestWarranty: role === 'admin' || role === 'warehouse' || role === 'sales' || role === 'tech',
      canReplace: role === 'admin' || role === 'tech',
      setUser,
      logout,
    }),
    [user, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth باید داخل AuthProvider استفاده شود.');
  return ctx;
}
