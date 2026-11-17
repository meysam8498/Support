// ============================================================
// وضعیت فهرست در URL — رفرش و دکمه‌ی بازگشت
// ------------------------------------------------------------
// • «رفرش» = باز شدن همان نشانی از نو: صفحه/فیلتر/مرتب‌سازی باید همان چیزی
//   باشد که در آدرس است و همان پارامترها به سرور برود.
// • «بازگشت» = رفتن به صفحه‌ی دیگر و برگشتن: فیلترهای فهرست از دست نمی‌رود
//   چون آدرس منبع حقیقت است.
// • داده‌ها از mock آفلاین fetch می‌آیند؛ URLهای درخواستی ثبت می‌شوند.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { adminUser, clearRouteOverrides } from './apiMock';

/** URLهایی که اپ در این تست درخواست کرده — برای اثبات همگامی فیلتر و درخواست */
let calls: string[] = [];
let innerFetch: typeof fetch;

beforeEach(() => {
  calls = [];
  innerFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(typeof input === 'string' ? input : String(input));
    return innerFetch(input, init);
  });
});

afterEach(() => {
  vi.stubGlobal('fetch', innerFetch);
  clearRouteOverrides();
  cleanup();
});

/**
 * رندر اپ با ردیابی نشانی و امکان ناوبری (برای شبیه‌سازی Back).
 * localStorage مثل renderApp مقداردهی می‌شود تا مسیر محافظت‌شده باز شود.
 */
function renderTracked(initial: string) {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify(adminUser));
  localStorage.setItem('theme', 'light');

  const loc = { current: '' };
  const nav: { current: ((to: unknown) => void) | null } = { current: null };
  function Probe() {
    const location = useLocation();
    const navigate = useNavigate();
    loc.current = `${location.pathname}${location.search}`;
    nav.current = navigate as (to: unknown) => void;
    return null;
  }

  const utils = render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initial]}>
          <Probe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );

  return {
    ...utils,
    loc,
    go: (to: unknown) => act(() => { nav.current!(to); }),
    back: () => act(() => { nav.current!(-1); }),
  };
}

/** آخرین درخواست فهرست (نه /stats) با مسیر مشخص */
function lastListCall(prefix: string): string | undefined {
  return [...calls].reverse().find((u) => u.includes(`${prefix}?`) && !u.includes('/stats'));
}

describe('وضعیت فهرست در URL — رفرش', () => {
  it('تجهیزات: صفحه/فیلتر/جست‌وجو/مرتب‌سازی از نشانی خوانده و به سرور فرستاده می‌شود', async () => {
    renderTracked('/devices?status=active&q=SN&page=2&sort=serial&dir=asc');

    // ردیف فهرست رندر می‌شود
    await screen.findByText('SN-0001');

    // درخواست با همان پارامترهای نشانی (page=2 → offset=50)
    await waitFor(() => {
      const call = lastListCall('/devices');
      expect(call).toBeTruthy();
      expect(call!).toContain('limit=50');
      expect(call!).toContain('offset=50');
      expect(call!).toContain('status=active');
      expect(call!).toContain('q=SN');
      expect(call!).toContain('sort=serial');
      expect(call!).toContain('dir=asc');
    });

    // وضعیت بصری هم با آدرس هم‌خوان است: چیپ فعال + aria-sort صعودی
    expect(screen.getByRole('button', { name: /فعال/ }).className).toContain('chip-active');
    const serialTh = screen.getByTitle('مرتب‌سازی بر اساس سریال').closest('th');
    expect(serialTh?.getAttribute('aria-sort')).toBe('ascending');
    // ورودی جست‌وجوی فهرست از نشانی پر می‌شود (ورودی جست‌وجوی هدر جدا است)
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs.some((i) => i.value === 'SN')).toBe(true);
  });

  it('قطعات: فیلتر کاتالوگ و «فقط تکراری‌ها» هم از نشانی بازسازی می‌شوند', async () => {
    renderTracked('/parts?catalog=2&dup=1&page=2');
    await screen.findByText('ماژول حافظه HIST DIMM');

    await waitFor(() => {
      const call = lastListCall('/parts');
      expect(call).toBeTruthy();
      expect(call!).toContain('offset=50');
      expect(call!).toContain('catalog=2');
      expect(call!).toContain('dup=1');
    });
  });
});

describe('وضعیت فهرست در URL — دکمه‌ی بازگشت', () => {
  it('فیلتر انتخاب‌شده در آدرس می‌ماند و با برگشتن، فهرست دوباره با آن خوانده می‌شود', async () => {
    const u = userEvent.setup();
    const view = renderTracked('/devices');
    await screen.findByText('SN-0001');

    // انتخاب فیلتر «معیوب» → آدرس و درخواست همگام می‌شوند
    await u.click(screen.getByRole('button', { name: /معیوب/ }));
    await waitFor(() => expect(view.loc.current).toBe('/devices?status=defective'));
    await waitFor(() => expect(lastListCall('/devices')).toContain('status=defective'));
    // فچ دوباره نباید فیلترها/جدول را با اسکلت جایگزین کند (فوکوس و ورودی حفظ می‌شود)
    expect(screen.getByRole('button', { name: /فعال/ })).toBeTruthy();

    // رفتن به صفحه‌ی دیگر و برگشت با Back
    const before = calls.length;
    view.go('/about');
    await waitFor(() => expect(view.loc.current).toBe('/about'));

    view.back();
    await waitFor(() => expect(view.loc.current).toBe('/devices?status=defective'));

    // فهرست دوباره با همان فیلتر خوانده شده و چیپ هنوز فعال است
    await waitFor(() => {
      const after = calls.slice(before).filter((x) => x.includes('/devices?'));
      expect(after.some((x) => x.includes('status=defective'))).toBe(true);
    });
    expect(screen.getByRole('button', { name: /معیوب/ }).className).toContain('chip-active');
  });
});
