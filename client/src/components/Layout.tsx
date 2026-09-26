// ============================================================
// چیدمان اصلی — سایدبار ناوبری + محتوای صفحه
// سیستم طراحی Flip7: تیل/طلایی/کرم — طراح: میثم ایجادی / Meysam Ijadi
// • منو بر اساس نقش کاربر گیت می‌شود (مدیریت کاربران فقط برای admin).
// • آیتم فعال: قرصی تیل با هاله‌ی glow و نوار رنگی سمت راست (RTL).
// • دکمه‌ی سوییچ تم دارک/لات در هدر با جداکننده‌ی نقطه‌چین.
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
  { to: '/serial-import', icon: '📥', label: t.navSerialImport, adminOnly: true },
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
        } bg-white border-l-2 border-dashed border-brand-100 flex flex-col transition-all duration-200 shrink-0 dark:bg-[#082423] dark:border-brand-900`}
      >
        {/* لوگو — پارالوگرام کرم با چرخش، الهام از جعبه‌ی Flip7 */}
        <div className="relative h-20 flex items-center justify-center border-b-2 border-dashed border-brand-100 dark:border-brand-900 overflow-visible">
          {!collapsed && (
            <span
              className="inline-block bg-cream border-2 border-brand-700 px-3 py-1 shadow-card"
              style={{ transform: 'rotate(-3deg) skewX(-6deg)', borderRadius: 6 }}
            >
              <span className="text-brand-700 font-extrabold text-xs tracking-widest dark:text-brand-200">
                {t.appName}
              </span>
            </span>
          )}
          {collapsed && (
            <span
              className="text-2xl font-extrabold text-gold-dark"
              style={{ textShadow: '1px 1px 0 #1e8c86' }}
            >
              ۷
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-3 text-brand-400 hover:text-brand-600 text-lg dark:hover:text-brand-200"
            style={{ left: collapsed ? '0.75rem' : '13.5rem' }}
            aria-label="جمع/باز کردن منو"
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* لینک‌ها */}
        <nav className="flex-1 py-4 space-y-1.5 px-2 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-full text-sm transition-all duration-200 overflow-hidden ${
                  isActive
                    ? 'bg-brand-500 text-white font-bold shadow-teal-glow'
                    : 'text-brand-800 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-900/50'
                } ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              {/* نوار رنگی سمت راست برای آیتم فعال (RTL) */}
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-1 right-0 w-1 rounded-full bg-gold" />}
                  <span className="text-lg">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* کاربر */}
        <div className="border-t-2 border-dashed border-brand-100 p-3 dark:border-brand-900">
          {!collapsed ? (
            <div className="text-xs text-brand-600 mb-2 truncate dark:text-brand-300">
              {user?.fullName} (
              <span className={user?.role === 'admin' ? 'text-gold-dark font-bold' : ''}>
                {user?.role === 'admin' ? t.roleAdmin : t.roleUser}
              </span>
            )
            </div>
          ) : null}
          <button onClick={doLogout} className="btn-secondary w-full text-xs">
            {!collapsed && t.logout}
            {collapsed && '↩'}
          </button>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <main className="flex-1 overflow-y-auto bg-surface-base dark:bg-[#0b2e2c]">
        {/* نوار بالا با دکمه‌ی تم */}
        <div className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b-2 border-dashed border-brand-100 bg-white/85 px-6 py-3 backdrop-blur dark:border-brand-900 dark:bg-[#082423]/85">
          <button
            onClick={toggleTheme}
            className="btn-secondary !min-h-[36px] !rounded-full px-3 text-sm"
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
