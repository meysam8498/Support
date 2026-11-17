// ============================================================
// وضعیت فهرست در URL — رفرش و دکمه‌ی بازگشت
// ------------------------------------------------------------
// • «رفرش» = باز شدن همان نشانی از نو: صفحه/فیلتر/مرتب‌سازی باید همان چیزی
//   باشد که در آدرس است و همان پارامترها به سرور برود.
// • «بازگشت» = رفتن به صفحه‌ی دیگر و برگشتن: فیلترهای فهرست از دست نمی‌رود
//   چون آدرس منبع حقیقت است.
// • درخواست‌های ارسالی از apiCalls خوانده می‌شوند (بدون دور زدن fetch).
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { apiCalls, clearApiCalls, clearRouteOverrides, deviceFixture, overrideRoute } from './apiMock';
import { seedSession } from './renderApp';

beforeEach(() => clearApiCalls());

afterEach(() => {
  clearRouteOverrides();
  cleanup();
});

/** رندر اپ با ردیابی نشانی و امکان ناوبری (برای شبیه‌سازی Back) */
function renderTracked(initial: string) {
  seedSession();
  const track: { url: string; navigate: ((to: unknown) => void) | null } = { url: '', navigate: null };

  function Probe() {
    const location = useLocation();
    track.url = `${location.pathname}${location.search}`;
    track.navigate = useNavigate() as (to: unknown) => void;
    return null;
  }

  render(
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
    url: () => track.url,
    go: (to: unknown) => act(() => { track.navigate!(to); }),
    back: () => act(() => { track.navigate!(-1); }),
  };
}

/** پارامترهای آخرین درخواست فهرست (نه /stats) با مسیر مشخص */
function lastQuery(prefix: string): URLSearchParams | undefined {
  const call = [...apiCalls()].reverse().find((u) => u.startsWith(`${prefix}?`));
  return call ? new URLSearchParams(call.slice(call.indexOf('?') + 1)) : undefined;
}

/** چیپ وضعیت فعال است؟ (تنها نشان وضعیت در UI همین کلاس است) */
const chipActive = (name: RegExp) => screen.getByRole('button', { name }).className.includes('chip-active');

describe('وضعیت فهرست در URL — رفرش', () => {
  it('تجهیزات: صفحه/فیلتر/جست‌وجو/مرتب‌سازی از نشانی خوانده و به سرور فرستاده می‌شود', async () => {
    renderTracked('/devices?status=active&q=SN&page=2&sort=serial&dir=asc');
    await screen.findByText('SN-0001');

    // همان پارامترهای نشانی به سرور رفته‌اند (page=2 → offset=50)
    await waitFor(() => {
      const q = lastQuery('/devices');
      expect(q).toBeDefined();
      expect(Object.fromEntries(q!)).toMatchObject({
        limit: '50', offset: '50', status: 'active', q: 'SN', sort: 'serial', dir: 'asc',
      });
    });

    // وضعیت بصری با آدرس هم‌خوان است: چیپ فعال، aria-sort صعودی و ورودی جست‌وجوی فهرست
    expect(chipActive(/فعال/)).toBe(true);
    expect(screen.getByTitle('مرتب‌سازی بر اساس سریال').closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)).toContain('SN');
  });

  it('قطعات: فیلتر کاتالوگ از نشانی بازسازی و به سرور فرستاده می‌شود', async () => {
    renderTracked('/parts?catalog=2&page=2');
    await screen.findByText('ماژول حافظه HIST DIMM');

    await waitFor(() => {
      const q = lastQuery('/parts');
      expect(q).toBeDefined();
      expect(Object.fromEntries(q!)).toMatchObject({ offset: '50', catalog: '2' });
    });

    // بنر «مرجع کاتالوگ» نشان می‌دهد فیلتر از آدرس در UI هم فعال است
    expect(screen.getByText(/مرجع کاتالوگ/)).toBeTruthy();
  });
});

describe('وضعیت فهرست در URL — فچ دوباره', () => {
  it('حین درخواست تازه، ورودی جست‌وجو و فوکوسش می‌ماند و پاسخ آدرس را عوض نمی‌کند', async () => {
    const u = userEvent.setup();
    const view = renderTracked('/devices');
    await screen.findByText('SN-0001');

    // پاسخ فهرست تا آزادکردن دستی معلق می‌ماند تا وضعیت «در حال بارگذاری» قابل سنجش باشد
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    overrideRoute('GET', /^\/devices(\?|$)/, async () => {
      await gate;
      return [deviceFixture];
    });

    const input = screen.getByPlaceholderText('جستجو...') as HTMLInputElement;
    await u.click(input);
    await u.type(input, 'SN');

    // درخواست تازه با q=SN رفته ولی پاسخش هنوز نرسیده
    await waitFor(() => expect(lastQuery('/devices')?.get('q')).toBe('SN'));
    const urlDuringFetch = view.url();
    expect(urlDuringFetch).toBe('/devices?q=SN');

    // در این فاصله اسکلت جای جدول/فیلترها را نگرفته: همان ورودی و همچنان فوکوس‌دار
    expect(screen.queryByPlaceholderText('جستجو...')).toBe(input);
    expect(document.activeElement).toBe(input);

    release();
    await waitFor(() => expect(screen.getByText('SN-0001')).toBeTruthy());

    // پاسخ فچ فقط جدول را پر می‌کند؛ آدرس و ورودی/فوکوس دست‌نخورده می‌مانند
    expect(view.url()).toBe(urlDuringFetch);
    expect(screen.getByPlaceholderText('جستجو...')).toBe(input);
    expect(input.value).toBe('SN');
    expect(document.activeElement).toBe(input);
  });
});

describe('وضعیت فهرست در URL — دکمه‌ی بازگشت', () => {
  it('فیلتر انتخاب‌شده در آدرس می‌ماند و با برگشتن، فهرست دوباره با آن خوانده می‌شود', async () => {
    const u = userEvent.setup();
    const view = renderTracked('/devices');
    await screen.findByText('SN-0001');

    // انتخاب فیلتر «معیوب» → آدرس و درخواست همگام می‌شوند
    await u.click(screen.getByRole('button', { name: /معیوب/ }));
    await waitFor(() => expect(view.url()).toBe('/devices?status=defective'));
    await waitFor(() => expect(lastQuery('/devices')?.get('status')).toBe('defective'));

    // رفتن به صفحه‌ی دیگر و برگشت با Back
    view.go('/about');
    await waitFor(() => expect(view.url()).toBe('/about'));

    clearApiCalls();
    view.back();
    await waitFor(() => expect(view.url()).toBe('/devices?status=defective'));

    // پس از بازگشت، فهرست دوباره با همان فیلتر خوانده می‌شود و چیپ فعال می‌ماند
    await waitFor(() => expect(lastQuery('/devices')?.get('status')).toBe('defective'));
    expect(chipActive(/معیوب/)).toBe(true);
  });
});
