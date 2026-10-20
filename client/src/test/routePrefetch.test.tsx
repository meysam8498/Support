// ============================================================
// تست prefetch چانک صفحات lazy — ورود به صفحه بدون مکث روی hover/focus منو
// ------------------------------------------------------------
// prefetchProps که Layout (سه سطح منو) و CTAهای درون‌صفحه پخش می‌کنند، هنگام
// hover موس و Tab کیبورد صدا زده می‌شود؛ اینجا رفتار همان تابع روی شل واقعی
// (Layout با درخت مسیرهای خودِ App) سنجیده می‌شود:
//   • صدا زدن درست و فقط یک‌بار → جلوگیری از درخواست تکراری با WARMED_CHUNKS
//   • مسیر ایستا → no-op بدون خطا (پخش‌کردن prefetchProps روی همه‌ی لینک‌ها امن است)
//   • پسوند devices/:id/parts-grid → چانک گرید قطعات با هر شناسه‌ای
// نکته: React رویداد ورود موس را از mouseover می‌سازد (onMouseEnter بومی
// نیست) — پس تست با fireEvent.mouseOver رخ می‌دهد، نه mouseEnter.
// ============================================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderApp } from './renderApp';
import { t } from '../i18n/fa';
import { CHUNK_LOADERS, WARMED_CHUNKS, prefetchChunk } from '../pages/registry';

/** بازگرداندن loadهای اصلی بعد از هر تست */
const restorers: Array<() => void> = [];

afterEach(() => {
  restorers.splice(0).forEach((restore) => restore());
  WARMED_CHUNKS.clear();
});

/** جاسوسی موقت روی load یک چانک — مدول واقعی صفحه در تست بارگذاری نمی‌شود */
function spyChunk(key: string) {
  const entry = CHUNK_LOADERS.find((e) => e.key === key);
  if (!entry) throw new Error(`چانکی با کلید «${key}» در CHUNK_LOADERS ثبت نیست`);
  const original = entry.load;
  const spy = vi.fn(() => Promise.resolve({ default: () => null }));
  entry.load = spy;
  restorers.push(() => { entry.load = original; });
  return spy;
}

describe('prefetch چانک صفحات lazy روی hover/focus منو', () => {
  it('hover روی لینک «گزارش‌ها» در ناوبری اصلی → چانک یک‌بار گرم می‌شود', () => {
    const load = spyChunk('/reports');
    renderApp('/');
    fireEvent.mouseOver(screen.getByTitle(t.navReports));
    expect(load).toHaveBeenCalledTimes(1);
    expect(WARMED_CHUNKS.has('/reports')).toBe(true);
  });

  it('hover تکراری روی همان لینک → درخواست دوم نمی‌رود', () => {
    const load = spyChunk('/reports');
    renderApp('/');
    const link = screen.getByTitle(t.navReports);
    fireEvent.mouseOver(link);
    fireEvent.mouseOver(link);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('focus با کیبورد (Tab) روی لینک → کاربر کیبوردی هم قبل از کلیک چانک را گرم می‌کند', () => {
    const load = spyChunk('/serial-import');
    renderApp('/');
    fireEvent.focus(screen.getByTitle(t.navSerialImport));
    expect(load).toHaveBeenCalledTimes(1);
    expect(WARMED_CHUNKS.has('/serial-import')).toBe(true);
  });

  it('hover روی مقصد ایستا (دستگاه‌ها) → no-op بدون خطا و بدون گرم‌شدن', () => {
    renderApp('/');
    fireEvent.mouseOver(screen.getByTitle(t.navDevices));
    expect(WARMED_CHUNKS.size).toBe(0);
  });

  it('مسیر devices/:id/parts-grid → با هر شناسه‌ای چانک گرید قطعات match می‌شود', () => {
    const load = spyChunk('parts-grid');
    prefetchChunk('/devices/42/parts-grid');
    expect(load).toHaveBeenCalledTimes(1);
    expect(WARMED_CHUNKS.has('parts-grid')).toBe(true);
  });

  it('منوی کاربر: hover روی «پنل ساخت لایسنس» → چانک پنل لایسنس گرم می‌شود', async () => {
    const load = spyChunk('/issue');
    renderApp('/');
    fireEvent.click(screen.getByLabelText('منوی کاربر'));
    const item = await screen.findByRole('menuitem', { name: /پنل ساخت لایسنس/ });
    fireEvent.mouseOver(item);
    expect(load).toHaveBeenCalledTimes(1);
    expect(WARMED_CHUNKS.has('/issue')).toBe(true);
  });
});
