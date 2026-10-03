// ============================================================
// Context مدیریت تم — روشن/تاریک/همگام با سیستم
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • پیش‌فرض «روشن» است (نه سیستم‌عامل) — انتخاب کاربر در localStorage می‌ماند.
// • «همگام با سیستم»: کلاس dark با prefers-color-scheme هماهنگ می‌شود و به
//   تغییر زنده‌ی سیستم‌عامل هم واکنش نشان می‌دهد (گوش دادن به matchMedia).
// • کلاینت‌ها همیشه از isDark (وضعیت رندرشده) استفاده کنند، نه theme خام —
//   چون در حالت system، مقدار theme خودِ 'system' است.
// ============================================================
import React, { createContext, useContext, useEffect, useState } from 'react';

/** انتخاب کاربر: روشن/تاریک صریح یا همگام با سیستم‌عامل */
export type Theme = 'light' | 'dark' | 'system';
/** تم رندرشده — همیشه light یا dark */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

interface ThemeContextValue {
  /** انتخاب ذخیره‌شده‌ی کاربر ('system' شامل) */
  theme: Theme;
  /** تم رندرشده — برای شرط‌گذاری UI از این استفاده کنید */
  isDark: boolean;
  /** همان isDark — نام گویا برای خوانایی */
  resolved: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  // پیش‌فرض: روشن — فارغ از ترجیح سیستم‌عامل (تغییر ۱.۲۷: قبلاً system بود)
  return 'light';
}

function systemPrefersDark(): boolean {
  return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // تغییر زنده‌ی سیستم‌عامل — در حالت system بلافاصله اعمال می‌شود
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, resolved]);

  const setTheme = (t: Theme) => setThemeState(t);
  // کلید ساده (دکمه‌ی لاگین): روشن/تاریک صریح بر اساس وضعیت رندرشده فعلی
  const toggleTheme = () => setThemeState(resolved === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, isDark: resolved === 'dark', resolved, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme باید داخل ThemeProvider استفاده شود.');
  return ctx;
}
