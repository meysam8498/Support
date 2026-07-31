// ============================================================
// چیدمان اصلی — سایدبار ناوبری + محتوای صفحه
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// • منو بر اساس نقش کاربر گیت می‌شود (مدیریت کاربران فقط برای admin).
// • دکمه‌ی سوییچ تم دارک/لات در هدر.
// ============================================================
import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { t } from '../i18n/fa';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '🏠', label: t.navDashboard },
  { to: '/devices', icon: '🖥️', label: t.navDevices },
  { to: '/parts', icon: '🔩', label: t.navParts },
  { to: '/warranty', icon: '🛡️', label: t.navWarranty },
  { to: '/reports', icon: '📊', label: t.navReports },
  { to: '/lists', icon: '📋', label: t.navLists, adminOnly: true },
  { to: '/users', icon: '👥', label: t.navUsers, adminOnly: true },
];

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* سایدبار */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-white border-l border-gray-200 flex flex-col transition-all duration-200 shrink-0 dark:bg-slate-900 dark:border-slate-700`}
      >
        {/* لوگو */}
        <div className="relative h-16 flex items-center justify-center border-b border-gray-100 dark:border-slate-700">
          {!collapsed && (
            <span className="text-brand-700 font-bold text-sm dark:text-brand-300">{t.appName}</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-4 text-gray-400 hover:text-gray-600 text-lg dark:hover:text-slate-200"
            style={{ left: collapsed ? '0.75rem' : '14rem' }}
            aria-label="جمع/باز کردن منو"
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* لینک‌ها */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-medium dark:bg-slate-700 dark:text-brand-300'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                } ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* کاربر */}
        <div className="border-t border-gray-100 p-3 dark:border-slate-700">
          {!collapsed ? (
            <div className="text-xs text-gray-500 mb-2 truncate dark:text-slate-400">
              {user?.fullName} ({user?.role === 'admin' ? t.roleAdmin : t.roleUser})
            </div>
          ) : null}
          <button onClick={doLogout} className="btn-secondary w-full text-xs">
            {!collapsed && t.logout}
            {collapsed && '↩'}
          </button>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950">
        {/* نوار بالا با دکمه‌ی تم */}
        <div className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-gray-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
          <button
            onClick={toggleTheme}
            className="btn-secondary px-3 py-1.5 text-sm"
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
