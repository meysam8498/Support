// ============================================================
// Context احراز هویت — طراح: میثم ایجادی / Meysam Ijadi
// نقش‌ها: 'admin' (دسترسی کامل) و 'user' (فقط مشاهده/جستجو).
// متمرکزسازی کاربر فعلی + پرچم isAdmin برای گیتینگ رابط کاربری.
// ============================================================
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '../api/api';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
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

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAdmin: user?.role === 'admin', setUser, logout }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth باید داخل AuthProvider استفاده شود.');
  return ctx;
}
