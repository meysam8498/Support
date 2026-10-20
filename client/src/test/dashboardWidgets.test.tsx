// ============================================================
// تست RTL تخته‌ی ویجت‌های داشبورد (الگوی Microsoft CRM) روی صفحه‌ی واقعی
// ------------------------------------------------------------
// • ترتیب پیش‌فرض هر ۱۱ ویجت (شامل دو کارت ادمین: بکاپ/کلیدها)
// • حالت سفارشی‌سازی: دکمه‌های ↑/↓ کیبوردی → جابه‌جایی واقعی + ذخیره در localStorage
// • مخفی‌کردن با دکمه‌ی چشم + بازگردانی از «ویجت‌های مخفی‌شده»
// • «بازگشت به پیش‌فرض» بعد از جابه‌جایی/مخفی‌کردن
// • ماندگاری چیدمان بین دو بار رندر (کلید per-user در localStorage)
// داده‌ها از mock آفلاین fetch (apiMock با کاربر ادمین) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';
import { clearRouteOverrides } from './apiMock';
import { DEFAULT_ORDER, layoutKeyFor } from '../lib/dashboardLayout';

const LAYOUT_KEY = layoutKeyFor(1); // adminUser.id در apiMock

/** ترتیب ویجت‌های رندرشده‌ی تخته — از روی data-widget-id */
const boardOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-widget-id]')).map((el) => el.getAttribute('data-widget-id'));

/** رندر داشبورد و صبر تا هر دو کارت ادمین (بکاپ/کلیدها) سوار شده باشند */
async function renderReadyDashboard() {
  const view = renderApp('/');
  await screen.findByText('آخرین پشتیبان‌گیری'); // کارت بکاپ (فقط ادمین)
  await screen.findByText('کلیدهای امضای لایسنس'); // کارت کلیدها (فقط ادمین)
  return view;
}

/** دکمه‌ی سفارشی‌سازی تخته — متنش در حالت ویرایش «✓ اتمام سفارشی‌سازی» می‌شود («سفارشی‌سازی» مشترک است) */
const customizeBtn = () => screen.getByRole('button', { name: /سفارشی‌سازی/ });

describe('تخته‌ی ویجت‌های داشبورد — چیدمان قابل سفارشی‌سازی (CRM)', () => {
  beforeEach(() => localStorage.removeItem(LAYOUT_KEY));
  afterEach(() => {
    localStorage.removeItem(LAYOUT_KEY);
    clearRouteOverrides();
    cleanup();
  });

  it('هر ۱۱ ویجت به‌ترتیب پیش‌فرض DEFAULT_ORDER رندر می‌شود (بدون حالت ویرایش)', async () => {
    const { container } = await renderReadyDashboard();

    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]);
    // بیرون از حالت ویرایش: هیچ کنترل جابه‌جایی/مخفی‌کردنی در DOM نیست (ظاهر تمیز)
    expect(screen.queryByRole('button', { name: /بالاتر/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /مخفی کردن/ })).toBeNull();
    expect(customizeBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('دکمه‌ی ↑ کیبوردی ویجت را جابه‌جا می‌کند و چیدمان در localStorage ذخیره می‌شود', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();

    await u.click(customizeBtn());
    expect(customizeBtn().getAttribute('aria-pressed')).toBe('true');

    // «کارت‌های آمار» یک گام پایین‌تر: با «سهم قطعات فعال» جابه‌جا می‌شود
    await u.click(screen.getByRole('button', { name: 'انتقال «کارت‌های آمار» پایین‌تر' }));
    const expected = [...DEFAULT_ORDER];
    const si = expected.indexOf('stats');
    const pi = expected.indexOf('progress');
    [expected[si], expected[pi]] = [expected[pi], expected[si]]; // جای stats و progress عوض می‌شود
    expect(boardOrder(container)).toEqual(expected);

    // ماندگاری: همان چیدمان در کلید per-user خوانده می‌شود
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}').order).toEqual(expected);

    // یک گام دیگر → ویجت به انتهای زوج می‌رود؛ دکمه‌ی ↑ در مرز بی‌اثر نمی‌شکند
    await u.click(screen.getByRole('button', { name: 'انتقال «کارت‌های آمار» بالاتر' }));
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]); // برگشت به پیش‌فرض با ↑ معکوس
  });

  it('مخفی‌کردن با دکمه‌ی چشم → حذف از تخته + بازگردانی از فهرست مخفی‌شده‌ها', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();

    await u.click(customizeBtn());
    await u.click(screen.getByRole('button', { name: 'مخفی کردن «روند تعویض‌های ماهانه»' }));

    expect(boardOrder(container)).not.toContain('trend');
    expect(boardOrder(container)).toHaveLength(DEFAULT_ORDER.length - 1);

    // فهرست بازگردانی ظاهر و ویجت از آن برگردانده می‌شود — نام دسترس‌پذیر چیپ همان متن دکمه (👁 + عنوان) است
    const restore = screen.getByRole('button', { name: /روند تعویض‌های ماهانه/ });
    await u.click(restore);
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]);
  });

  it('«بازگشت به پیش‌فرض» هم ترتیب و هم مخفی‌ها را به حالت اولیه برمی‌گرداند', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();

    await u.click(customizeBtn());
    await u.click(screen.getByRole('button', { name: 'انتقال «میان‌برهای سریع» بالاتر' }));
    await u.click(screen.getByRole('button', { name: 'مخفی کردن «قطعات پرمصرف»' }));
    expect(boardOrder(container)).not.toEqual([...DEFAULT_ORDER]);

    await u.click(screen.getByRole('button', { name: /بازگشت به پیش‌فرض/ }));
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]);
    // فهرست مخفی‌شده‌ها خالی و پنهان است
    expect(screen.queryByText(/ویجت‌های مخفی‌شده/)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}').hidden).toEqual([]);
  });

  it('چیدمان بین دو بار رندر می‌ماند (بازگشایی مجدد → همان ترتیب، بدون حالت ویرایش)', async () => {
    const u = userEvent.setup();
    const first = await renderReadyDashboard();

    await u.click(customizeBtn());
    await u.click(screen.getByRole('button', { name: 'انتقال «کارت‌های آمار» پایین‌تر' }));
    const custom = boardOrder(first.container);
    expect(custom).not.toEqual([...DEFAULT_ORDER]);
    first.unmount();

    // رندر تازه همان کاربر → چیدمان ذخیره‌شده اعمال می‌شود
    const second = await renderReadyDashboard();
    expect(boardOrder(second.container)).toEqual(custom);
    // و حالت ویرایش ذخیره نمی‌شود — هر بار حالت عادی
    expect(customizeBtn().getAttribute('aria-pressed')).toBe('false');
  });
});
