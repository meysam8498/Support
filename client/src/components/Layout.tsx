// ============================================================
// چیدمان اصلی — سیستم طراحی Ember Studio (تراکوتا/استون گرم)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// • سایدبار ۲۵۶px، پس‌زمینه‌ی سفید گرم، حاشیه‌ی راست ۱px (RTL)
// • آیتم فعال: نوار تراکوتا ۳px سمت راست + پس‌زمینه‌ی ملایم گرم
// • هدر شفاف با backdrop-blur و حاشیه‌ی پایین هنگام اسکرول
// • منو بر اساس نقش کاربر گیت می‌شود (مدیریت کاربران فقط برای admin).
// ============================================================
import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { t } from '../i18n/fa';
import GlobalSearchBox from './GlobalSearchBox';

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
  { to: '/serial-import', icon: '📥', label: t.navSerialImport, roles: ['admin', 'warehouse', 'tech'] },
  { to: '/lists', icon: '📋', label: t.navLists, roles: ['admin', 'warehouse', 'tech'] },
  { to: '/users', icon: '👥', label: t.navUsers, roles: ['admin'] },
  { to: '/backups', icon: '🗄️', label: t.navBackups, roles: ['admin'] },
  { to: '/license', icon: '🔑', label: t.navLicense, roles: ['admin'] },
];

export default function Layout() {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* سایدبار ۲۵۶px — سفید گرم با حاشیه‌ی ۱px استون (RTL: حاشیه سمت چپ) */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-white dark:bg-stone-900 border-l border-stone-300 dark:border-stone-700 flex flex-col transition-all duration-200 shrink-0`}
      >
        {/* لوگو + نام ورک‌اسپیس */}
        <div className="relative h-16 flex items-center justify-center border-b border-stone-200 dark:border-stone-800 overflow-hidden">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
                م
              </span>
              <span className="text-stone-800 dark:text-stone-100 font-semibold text-sm">
                {t.appName}
              </span>
            </div>
          )}
          {collapsed && (
            <span className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
              م
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-4 text-stone-400 hover:text-stone-600 text-lg dark:hover:text-stone-200"
            style={{ left: collapsed ? '0.75rem' : '13.5rem' }}
            aria-label="جمع/باز کردن منو"
          >
            {collapsed ? '←' : '→'}
          </button>
        </div>

        {/* لینک‌ها — آیتم فعال: نوار تراکوتا ۳px راست + پس‌زمینه‌ی ملایم */}
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-stone-600 hover:bg-surface-raised dark:text-stone-300 dark:hover:bg-stone-800'
                } ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-1 right-0 w-[3px] rounded-full bg-brand-500" />
                  )}
                  <span className="text-lg">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* کاربر */}
        <div className="border-t border-stone-200 dark:border-stone-800 p-3">
          {!collapsed && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="w-6 h-6 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-stone-300">
                {user?.fullName?.charAt(0) ?? '؟'}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-700 dark:text-stone-200 truncate">
                  {user?.fullName}
                </div>
                <div
                  className={`text-[10px] ${
                    role === 'admin'
                      ? 'text-brand-600 dark:text-brand-400 font-semibold'
                      : 'text-stone-400'
                  }`}
                >
                  {role === 'admin' ? t.roleAdmin : role === 'viewer' ? t.roleUser : role === 'warehouse' ? 'انباردار' : role === 'sales' ? 'کارشناس فروش' : 'کارشناس فنی'}
                </div>
              </div>
            </div>
          )}
          <button onClick={doLogout} className="btn-secondary w-full text-xs">
            {!collapsed && t.logout}
            {collapsed && '↩'}
          </button>
        </div>
      </aside>

      {/* محتوای اصلی — پس‌زمینه‌ی سفید گرم صفحه */}
      <main className="flex-1 overflow-y-auto bg-surface-base dark:bg-stone-900">
        {/* نوار بالا: جست‌وجوی سراسری + تم — شفاف + blur، حاشیه‌ی پایین ۱px */}
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 px-6 py-3 backdrop-blur">
          <div className="flex-1 max-w-xl">
            <GlobalSearchBox compact />
          </div>
          <button
            onClick={toggleTheme}
            className="btn-secondary !min-h-[36px] !px-3 text-sm shrink-0"
            title={t.toggleTheme}
            aria-label={t.toggleTheme}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
