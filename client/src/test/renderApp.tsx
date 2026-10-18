// ============================================================
// هارنس رندر تست‌ها — همان ساختار واقعی اپ: ThemeProvider + AuthProvider
// + MemoryRouter با درخت مسیرهای خودِ App (AppRoutes) و شل واقعی (Layout)
// ------------------------------------------------------------
// localStorage با کاربر ادمین و توکن آزمایشی مقداردهی می‌شود تا مسیرهای
// Protected و گیت‌های نقش مانند محیط واقعی رفتار کنند.
// ============================================================
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { adminUser } from './apiMock';

/** رندر یک مسیر با shell واقعی — خروجی RTL برای axe/اسنپ‌شات DOM */
export function renderApp(path: string) {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify(adminUser));
  localStorage.setItem('theme', 'light');
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}
