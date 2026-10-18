// ============================================================
// تست دسترس‌پذیری (a11y) صفحات کلاینت — axe-core روی DOM رندرشده‌ی واقعی
// ------------------------------------------------------------
// • هر مسیرِ App (شامل جزئیات/فرم‌ها) با shell واقعی (Layout + منو + جست‌وجو)
//   رندر می‌شود و کل درخت با axe سنجیده می‌شود؛ داده‌ها از mock آفلاین fetch.
// • قانون color-contrast عمداً اینجا خاموش است: محاسبه‌ی تضاد رنگ به رندر
//   واقعی مرورگر نیاز دارد و در jsdom نتیجه‌ی معتبری نمی‌دهد — پوشش آن با
//   اسکن زنده‌ی مرورگر (داشبورد توسعه) انجام می‌شود؛ رنگ‌های UI در
//   tailwind.config ثابت و بازنگری‌شده‌اند.
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, act } from '@testing-library/react';
import axe from 'axe-core';
import { renderApp } from './renderApp';

interface PageCase {
  path: string;
  label: string;
}

const PAGES: PageCase[] = [
  { path: '/', label: 'داشبورد' },
  { path: '/devices', label: 'فهرست تجهیزات' },
  { path: '/devices/new', label: 'ثبت تجهیز جدید' },
  { path: '/devices/1', label: 'جزئیات تجهیز' },
  { path: '/devices/1/edit', label: 'ویرایش تجهیز' },
  { path: '/parts', label: 'فهرست قطعات' },
  { path: '/parts/new', label: 'ثبت قطعه‌ی جدید' },
  { path: '/parts/1', label: 'جزئیات قطعه' },
  { path: '/devices/1/parts-grid', label: 'گرید جدولی قطعات' },
  { path: '/warranty', label: 'سوابق تعویض گارانتی' },
  { path: '/warranty/replace', label: 'ثبت تعویض گارانتی' },
  { path: '/reports', label: 'گزارش‌ها' },
  { path: '/lists', label: 'مدیریت لیست‌ها' },
  { path: '/serial-import', label: 'ورود سریال از اکسل' },
  { path: '/users', label: 'مدیریت کاربران' },
  { path: '/backups', label: 'مدیریت بکاپ‌ها' },
  { path: '/license', label: 'لایسنس' },
  { path: '/issue', label: 'پنل ساخت لایسنس' },
  { path: '/about', label: 'درباره‌ی سامانه' },
  { path: '/logs', label: 'لاگ سرور' },
  { path: '/dashboard/customer/1', label: 'نمای مشتری' },
];

/**
 * فشردن زنجیره‌ی promiseهای mock و خروج از حالت loading پیش از سنجش axe.
 * صفحات lazy (reports/serial-import/logs) اول fallback نشان می‌دهند و ماژول‌شان
 * با import پویا می‌آید؛ تا وقتی fallback از DOM رفت صبر می‌کنیم تا axe واقعاً
 * روی خودِ صفحه سنجیده شود، نه روی فالبک.
 */
async function settle(container?: HTMLElement) {
  await flush();
  if (!container) return;
  const deadline = Date.now() + 5_000;
  while (container.querySelector('[data-testid="page-loading"]') && Date.now() < deadline) {
    await flush(20);
  }
  expect(
    container.querySelector('[data-testid="page-loading"]'),
    'بارگذاری صفحه‌ی lazy تمام نشد',
  ).toBeNull();
  // افکت‌های fetch صفحه بعد از سوار شدن chunk اجرا می‌شوند — یک بار دیگر flush
  await flush();
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
    if (ms === 0) await new Promise((r) => setTimeout(r, 0));
  });
}

/** قالب‌بندی نقض‌ها برای پیام شکست تست — شناسه + تعداد + نمونه HTML گره‌ها */
function formatViolations(violations: axe.Result[]): string {
  return violations
    .map((v) => `• ${v.id} [${v.impact ?? 'n/a'}] ×${v.nodes.length}: ${v.help}\n  نمونه: ${v.nodes.slice(0, 3).map((n) => n.html).join('\n        ')}`)
    .join('\n');
}

describe('دسترس‌پذیری (a11y) صفحات', () => {
  afterEach(() => cleanup());

  it.each(PAGES)('$label ($path) — بدون نقض WCAG A/AA و بهترین‌ها', async ({ path }) => {
    const { container, unmount } = renderApp(path);
    await settle(container);

    const results = await axe.run(container, {
      rules: {
        // نیازمند رندر واقعی مرورگر — در jsdom نتیجه‌ی قابل‌اتکا نمی‌دهد (توضیح بالای فایل)
        'color-contrast': { enabled: false },
      },
      resultTypes: ['violations'],
    });

    expect(
      results.violations,
      `نقض دسترس‌پذیری در ${path}:\n${formatViolations(results.violations)}`,
    ).toHaveLength(0);
    unmount();
  });

  it('لاگین — فرم ورود بدون نقض دسترس‌پذیری', async () => {
    // صفحه‌ی لاگین خارج از shell است (بدون Layout) — جداگانه سنجیده می‌شود
    localStorage.clear();
    const { default: LoginPage } = await import('../pages/LoginPage');
    const { ThemeProvider } = await import('../context/ThemeContext');
    const { AuthProvider } = await import('../context/AuthContext');
    const { MemoryRouter } = await import('react-router-dom');
    const { container } = render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>,
    );
    await settle();
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    expect(
      results.violations,
      `نقض دسترس‌پذیری در صفحه‌ی لاگین:\n${formatViolations(results.violations)}`,
    ).toHaveLength(0);
  });
});
