// ============================================================
// تست صفحه‌ی لاگ سرور در نسخه‌ی ادمین (۱.۳۰)
// ------------------------------------------------------------
// • جریان ادمین: بدون فرم توکن، خواندن با نشست، سقف ۵۰۰ خط
// • بسته‌ی پشتیبانی: سربرگ مشخصات + «همه‌ی» خطوط حتی با فیلتر فعال
// • جریان پشتیبانی: با support_only فرم توکن ظاهر می‌شود (بدون نشست ادمین)
// داده‌ها از mock آفلاین fetch (apiMock) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';
import { adminUser, overrideRoute, clearRouteOverrides } from './apiMock';

/** ۳ سطر لاگ نمونه — عمداً ۲ خطا + ۱ اطلاع تا فیلتر سطح قابل تست باشد */
const ENTRIES = [
  { t: '2026-10-20T06:00:00.000Z', level: 'error', msg: 'اتصال دیتابیس قطع شد (SQLITE_BUSY)' },
  { t: '2026-10-20T06:00:05.000Z', level: 'info', msg: 'بکاپ روزانه با موفقیت اجرا شد' },
  { t: '2026-10-20T06:00:09.000Z', level: 'error', msg: 'push به مقصد خارجی ناموفق بود' },
];

const LOGS_FIXTURE = {
  mode: 'admin',
  support_only: false,
  version: '1.28.0',
  server_version: '1.0.0',
  total: 42,
  entries: ENTRIES,
};

/**
 * ضبط Blob دانلودشده + بی‌اثر کردن کلیک لینک مصنوعی در jsdom.
 * نکته: دو متد روی «همان» شیء URL پچ می‌شوند، نه stub کردنِ خودِ گلوبال —
 * چون vi.stubGlobal برای fetch توسط setup.ts نصب شده و vi.unstubAllGlobals()
 * آن را هم برمی‌دارد (fetch سراسری تست‌ها می‌شکست).
 */
function stubDownload() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = ((b: Blob) => {
    blobs.push(b);
    return 'blob:mock-url';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => { /* noop */ }) as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return { blobs, names };
}

describe('لاگ سرور — جریان ادمین (نشست، بدون توکن)', () => {
  afterEach(() => {
    clearRouteOverrides();
    cleanup();
    vi.restoreAllMocks(); // فقط spyهای خودمان (کلیک لینک) برگردد — fetch سراسری دست‌نخورده می‌ماند
    // بازگردانی متهای URL به حالت اصلی (در jsdom تعریف نشده‌اند، پس حذف)
    // نکته‌ی تایپ: این دو متد روی «static» الگوی URLاند نه رابط example — همان‌جا پچ شدند، همان‌جا حذف
    const urlStatics = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    delete urlStatics.createObjectURL;
    delete urlStatics.revokeObjectURL;
  });

  it('بدون فرم توکن خوانده می‌شود و لاگ‌ها + نسخه‌ها را نشان می‌دهد', async () => {
    overrideRoute('GET', /^\/logs/, () => LOGS_FIXTURE);
    renderApp('/logs');

    // خودکار خوانده شد (جریان ادمین نیاز به کلیک ندارد)
    await screen.findByText(/اتصال دیتابیس قطع شد/);

    // فرم توکن اصلاً رندر نشده — نشست ادمین کافی است
    expect(screen.queryByLabelText('توکن پشتیبانی')).toBeNull();

    // هر سه سطر + بج‌های نسخه
    expect(screen.getByText(/بکاپ روزانه با موفقیت اجرا شد/)).toBeTruthy();
    expect(screen.getByText(/push به مقصد خارجی ناموفق بود/)).toBeTruthy();
    expect(screen.getByText('v1.28.0')).toBeTruthy();
    expect(screen.getByText(/server 1\.0\.0/)).toBeTruthy();

    // سقف ۵۰۰ در گزینه‌های تعداد خط ادمین هست
    const select = screen.getByLabelText('تعداد خطوط') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['100', '200', '500']);
  });

  it('بسته‌ی پشتیبانی (txt): سربرگ مشخصات + همه‌ی خطوط حتی با فیلتر فعال', async () => {
    const u = userEvent.setup();
    const dl = stubDownload();
    overrideRoute('GET', /^\/logs/, () => LOGS_FIXTURE);
    renderApp('/logs');
    await screen.findByText(/اتصال دیتابیس قطع شد/);

    // فیلتر «خطا» → فقط ۲ سطر نمایش داده می‌شود
    await u.click(screen.getByRole('button', { name: /خطا/ }));
    expect(screen.queryByText(/بکاپ روزانه با موفقیت اجرا شد/)).toBeNull();

    // خروجی پشتیبانی → فایل متنی
    await u.click(screen.getByRole('button', { name: /متنی \(txt\)/ }));
    await waitFor(() => expect(dl.blobs).toHaveLength(1));

    const text = await dl.blobs[0].text();
    // سربرگ مشخصات
    expect(text).toContain('بسته‌ی پشتیبانی');
    expect(text).toContain('1.28.0');
    expect(text).toContain('1.0.0');
    expect(text).toContain('نشست ادمین');
    // «همه‌ی» سطرها، نه فقط فیلترشده‌ها — همان چیزی که پشتیبانی لازم دارد
    expect(text).toContain('اتصال دیتابیس قطع شد');
    expect(text).toContain('بکاپ روزانه با موفقیت اجرا شد');
    expect(text).toContain('push به مقصد خارجی ناموفق بود');
    // زمان هر سطر ISO (بدون ابهام برای پشتیبانی)
    expect(text).toContain('[2026-10-20T06:00:00.000Z] [error]');
    // نام فایل با پسوند txt
    expect(dl.names[0]).toMatch(/^support-log-.*\.txt$/);
  });

  it('بسته‌ی پشتیبانی (JSON): ساختار meta + همه‌ی entries', async () => {
    const u = userEvent.setup();
    const dl = stubDownload();
    overrideRoute('GET', /^\/logs/, () => LOGS_FIXTURE);
    renderApp('/logs');
    await screen.findByText(/اتصال دیتابیس قطع شد/);

    await u.click(screen.getByRole('button', { name: 'JSON' }));
    await waitFor(() => expect(dl.blobs).toHaveLength(1));

    const parsed = JSON.parse(await dl.blobs[0].text()) as {
      meta: { product_version: string; server_version: string; access_mode: string; total_in_ring: number; loaded_entries: number };
      entries: { level: string; msg: string }[];
    };
    expect(parsed.meta.product_version).toBe('1.28.0');
    expect(parsed.meta.server_version).toBe('1.0.0');
    expect(parsed.meta.access_mode).toBe('admin');
    expect(parsed.meta.total_in_ring).toBe(42);
    expect(parsed.meta.loaded_entries).toBe(3);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries.some((e) => e.level === 'error')).toBe(true);
    expect(dl.names[0]).toMatch(/^support-log-.*\.json$/);
  });

  it('در حالت پشتیبانی (SUPPORT_ONLY) فرم توکن ظاهر و خواندن بدون توکن ممتنع می‌شود', async () => {
    overrideRoute('GET', /^\/version/, () => ({ version: '1.28.0', server_version: '1.0.0', support_only: true }));
    overrideRoute('GET', /^\/logs/, () => LOGS_FIXTURE);
    renderApp('/logs');

    // فرم توکن رندر شد
    const tokenInput = (await screen.findByLabelText('توکن پشتیبانی')) as HTMLInputElement;
    expect(tokenInput).toBeTruthy();

    // بدون توکن، دکمه‌ی خواندن پیام راهنما می‌دهد و لاگی نمی‌آید
    await userEvent.setup().click(screen.getByRole('button', { name: /خواندن لاگ/ }));
    await screen.findByText(/توکن پشتیبانی را وارد کنید/);
    expect(screen.queryByText(/اتصال دیتابیس قطع شد/)).toBeNull();
    // و گزینه‌های تعداد خط سقف ۲۰۰ حالت پشتیبانی را دارد
    const select = screen.getByLabelText('تعداد خطوط') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['50', '100', '150', '200']);
  });
});

describe('جریان غیرادمین — صفحه‌ی /logs', () => {
  afterEach(() => {
    clearRouteOverrides();
    cleanup();
  });

  const viewerUser = { ...adminUser, role: 'viewer' };

  it('نقش غیرادمین: سرور ۴۰۳ → پیام روشن، هیچ لاگی نمایش داده نمی‌شود، منوی لاگ هم نیست', async () => {
    // سرور واقعی برای غیرادمین ۴۰۳ برمی‌گرداند (requireRole('admin') در سمت سرور —
    // پوشش همین رفتار اینجا: صفحه باید پیام بدهد و هیچ داده‌ای نیاورد)
    overrideRoute('GET', /^\/logs/, () => ({ __status: 403, error: 'دسترسی برای نقش شما مجاز نیست.' }));
    renderApp('/logs', viewerUser);

    // خواندن خودکار (جریان admin) انجام و پیام ۴۰۳ نشان داده می‌شود
    await screen.findByText(/خواندن لاگ فقط برای نقش ادمین مجاز است/);

    // هیچ ورودی‌ای از لاگ روی صفحه نیست
    expect(screen.queryByText(/اتصال دیتابیس قطع شد/)).toBeNull();
    expect(screen.queryByText(/بکاپ روزانه با موفقیت اجرا شد/)).toBeNull();

    // منوی کاربر: آیتم «لاگ سرور» برای نقش غیرادمین فیلتر شده است
    await userEvent.setup().click(screen.getByRole('button', { name: 'منوی کاربر' }));
    expect(screen.queryByRole('link', { name: 'لاگ سرور' })).toBeNull();
  });
});
