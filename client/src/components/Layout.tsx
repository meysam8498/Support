// ============================================================
// چیدمان اصلی — سیستم طراحی PipelinePro (ایندیگو/فیروزه‌ای/نارنجی)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// • منوی افقی بالای صفحه (h-14): لوگو + لینک‌ها + جست‌وجو + تم + منوی کاربر
// • آیتم فعال: پس‌زمینه‌ی ایندیگو ملایم + متن ایندیگو (چیپ فعال)
// • منوی کاربر (dropdown): پروفایل، «درباره‌ی سامانه»، «ورود کد لایسنس» (ادمین)، خروج
// • منو بر اساس نقش کاربر گیت می‌شود.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { t } from '../i18n/fa';
import GlobalSearchBox from './GlobalSearchBox';
import LicenseBadge from './LicenseBadge';
import Alert from './Alert';
import { api } from '../api/api';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  /** نقش‌های مجاز — خالی = همه */
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', label: t.navDashboard },
  { to: '/devices', icon: '🖥️', label: t.navDevices },
  { to: '/parts', icon: '🔩', label: t.navParts },
  { to: '/warranty', icon: '🛡️', label: t.navWarranty },
  { to: '/reports', icon: '📊', label: t.navReports },
  { to: '/lists', icon: '📋', label: t.navLists, roles: ['admin', 'warehouse', 'tech'] },
  { to: '/serial-import', icon: '📥', label: t.navSerialImport, roles: ['admin', 'warehouse', 'tech'] },
];

/** آیتم‌های منوی کاربر — ابزارهای مدیریتی و اطلاعاتی */
const USER_MENU_ITEMS: NavItem[] = [
  { to: '/about', icon: 'ℹ️', label: 'درباره‌ی سامانه' },
  { to: '/issue', icon: '🧾', label: 'پنل ساخت لایسنس', roles: ['admin'] },
  { to: '/users', icon: '👥', label: t.navUsers, roles: ['admin'] },
  { to: '/backups', icon: '🗄️', label: t.navBackups, roles: ['admin'] },
  { to: '/license', icon: '🔑', label: t.navLicense, roles: ['admin'] },
  // نمایشگر لاگ سرور — فقط در استقرار پشتیبانی (SUPPORT_ONLY=1) معنا دارد
  { to: '/logs', icon: '📜', label: t.navLogs, roles: ['admin'] },
];

export default function Layout() {
  const { user, role, logout } = useAuth();
  const { theme: themeMode, isDark, setTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // سرور پشتیبانی (SUPPORT_ONLY=1) — بنر ثابت زیر هدر (۱.۲۵)
  const [supportOnly, setSupportOnly] = useState(false);

  useEffect(() => {
    api.get<{ support_only?: boolean }>('/version')
      .then((r) => setSupportOnly(!!r.support_only))
      .catch(() => { /* بی‌صدا */ });
  }, []);

  const mainItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
  const userItems = USER_MENU_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  // بستن منوی کاربر و منوی تم با کلیک بیرون
  const themeMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm transition-colors duration-150 whitespace-nowrap ${
      isActive
        ? 'bg-brand-500 text-white font-semibold shadow-glow'
        : 'text-stone-600 dark:text-stone-300 hover:bg-surface-raised dark:hover:bg-white/5'
    }`;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ═══════════ منوی بالای صفحه ═══════════ */}
      {/* تم تاریک: گرادیان ایندیگوی متمایز — هم‌زبان با صفحه‌ی لاگین (یکدستی کل اپ) */}
      <header className="shrink-0 z-20 bg-white dark:bg-[linear-gradient(180deg,#191932_0%,#12121f_100%)] border-b border-stone-200 dark:border-indigo-500/20">
        <div className="flex items-center gap-3 px-4 h-14">
          {/* لوگو */}
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold shadow-glow">
              م
            </span>
            <span className="hidden md:block text-stone-900 dark:text-stone-100 font-display font-bold text-sm tracking-wide">
              {t.appName}
            </span>
          </NavLink>

          {/* لینک‌های اصلی — دسکتاپ */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {mainItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkCls} title={item.label}>
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* همبرگر — موبایل/تبلت */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden btn-ghost min-h-[36px] px-2.5 shrink-0"
            aria-label="منو"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>

          {/* جست‌وجوی سراسری */}
          <div className="flex-1 lg:flex-none lg:max-w-md min-w-0">
            <GlobalSearchBox compact />
          </div>

          {/* بج وضعیت لایسنس — در همه‌ی صفحات */}
          <div className="hidden sm:block shrink-0">
            <LicenseBadge />
          </div>

          {/* تم — منوی سه‌گزینه‌ای: روشن / تاریک / همگام با سیستم */}
          <div className="relative shrink-0" ref={themeMenuRef}>
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className={`btn-ghost min-h-[36px] px-2.5 text-base shrink-0 ${themeMenuOpen ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
              title={t.toggleTheme}
              aria-label={t.toggleTheme}
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
            >
              {themeMode === 'system' ? '🖥️' : isDark ? '☀️' : '🌙'}
              <span className="text-[10px] text-stone-400 mr-0.5">{themeMenuOpen ? '▴' : '▾'}</span>
            </button>
            {themeMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-44 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-lg py-1.5 z-30"
              >
                <p className="px-3 pb-1.5 pt-0.5 text-[11px] text-stone-400">{t.themeMenu}</p>
                {([
                  { mode: 'light' as const, icon: '☀️', label: t.themeLight },
                  { mode: 'dark' as const, icon: '🌙', label: t.themeDark },
                  { mode: 'system' as const, icon: '🖥️', label: t.themeSystem },
                ]).map((opt) => (
                  <button
                    key={opt.mode}
                    role="menuitemradio"
                    aria-checked={themeMode === opt.mode}
                    onClick={() => { setTheme(opt.mode); setThemeMenuOpen(false); }}
                    className={`list-item border-b-0 h-10 w-full text-sm ${
                      themeMode === opt.mode
                        ? 'text-brand-700 font-semibold dark:text-brand-300'
                        : 'text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="flex-1 text-right">{opt.label}</span>
                    {themeMode === opt.mode && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* منوی کاربر */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 ${
                menuOpen
                  ? 'bg-brand-50 border-brand-200 dark:bg-brand-900/30 dark:border-brand-700'
                  : 'border-transparent hover:bg-surface-raised dark:hover:bg-white/5'
              }`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="w-6.5 h-6.5 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-[11px] font-bold text-white">
                {user?.fullName?.charAt(0) ?? '؟'}
              </span>
              <span className="hidden sm:block max-w-[110px] truncate text-xs font-semibold text-stone-700 dark:text-stone-200">
                {user?.fullName}
              </span>
              <span className="text-[10px] text-stone-400">{menuOpen ? '▴' : '▾'}</span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-60 rounded-lg border border-stone-200 dark:border-indigo-500/25 bg-white dark:bg-[#161628] shadow-lg py-1.5 z-30"
              >
                {/* هدر پروفایل */}
                <div className="px-3 pb-2 pt-1 border-b border-stone-100 dark:border-white/10">
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 truncate">{user?.fullName}</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {role === 'admin' ? t.roleAdmin : role === 'viewer' ? t.roleUser : role === 'warehouse' ? 'انباردار' : role === 'sales' ? 'کارشناس فروش' : 'کارشناس فنی'}
                  </p>
                </div>
                {/* آیتم‌ها */}
                {userItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="list-item border-b-0 h-10 text-stone-700 dark:text-stone-200"
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
                <div className="border-t border-stone-100 dark:border-white/10 mt-1 pt-1">
                  <button
                    onClick={doLogout}
                    className="list-item border-b-0 h-10 w-full text-coral dark:text-coral-light"
                  >
                    <span className="text-base leading-none">↩</span>
                    <span>{t.logout}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* منوی موبایل — کشویی زیر هدر */}
        {mobileOpen && (
          <nav className="lg:hidden border-t border-stone-200 dark:border-indigo-500/20 px-3 py-2 grid grid-cols-2 gap-1">
            {mainItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isActive
                      ? 'bg-brand-500 text-white font-semibold'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-surface-raised dark:hover:bg-stone-800'
                  }`
                }
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
            {userItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-surface-raised dark:hover:bg-stone-800"
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* بنر ثابت سرور پشتیبانی — پیام خنثی/راهنما → variant info (بدون رنگ فوریت) */}
      {supportOnly && (
        <div
          className="shrink-0 z-10 px-4 pt-2"
          title="این استقرار با SUPPORT_ONLY=1 اجرا شده — داده‌ی مشتری اینجا نگه‌داری نمی‌شود"
        >
          <Alert variant="info">
            سرور پشتیبانی — این سامانه فقط برای بررسی ایرادها و ساخت کد لایسنس است؛ داده‌ی مشتری اینجا نگه‌داری نمی‌شود.
          </Alert>
        </div>
      )}

      {/* محتوای اصلی — تم تاریک: بوم سنگی تیره + هاله‌ی ایندیگوی ملایم بالای بوم */}
      <main className="flex-1 overflow-y-auto bg-surface-base dark:bg-[#1c1917] dark:bg-[radial-gradient(1100px_520px_at_50%_-12%,rgba(99,102,241,0.09),transparent)]">
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
