// ============================================================
// نشان «آخرین همگام‌سازی» بیرون از داشبورد — صفحات بکاپ / لاگ‌ویور / گزارش‌ها
// -------------------------------------------------------------
// • زمانِ ثبت‌شده توسط تخته‌ی داشبورد (writeLastSynced روی همان کلید per-user)
//   در هر سه صفحه خوانده و با همان قطعه‌ی LastSyncedBadge نمایش داده می‌شود
// • همان رفتار قابل‌کلیک زنجیره‌ی نشان‌ها: aria-expanded=false → کلیک → جزئیات
//   تاریخ کامل (شمسی با نام ماه + میلادی با رقم لاتین) → کلیک دوم جمع می‌کند
// • بدون همگام‌سازیِ قبلی، نشان پنهان است — زمانِ غلط/خالی نمایش داده نمی‌شود
// داده‌ها از mock آفلاین fetch (apiMock با کاربر ادمین) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';
import { layoutKeyFor, writeLastSynced } from '../lib/dashboardLayout';

const ISO = '2026-10-18T06:30:00.000Z';
const PAGES = ['/backups', '/logs', '/reports'] as const;

describe('نشان «آخرین همگام‌سازی» در صفحات بکاپ/لاگ/گزارش', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('زمانِ ثبت‌شده‌ی داشبورد را با همان رفتار قابل‌کلیک نشان می‌دهند', async () => {
    writeLastSynced(layoutKeyFor(1), ISO); // همان کلیدی که تخته‌ی داشبورد می‌نویسد (adminUser.id=1)
    expect(localStorage.getItem(`${layoutKeyFor(1)}:last-synced`)).toBe(ISO);

    for (const path of PAGES) {
      renderApp(path);
      const badge = await screen.findByTestId('last-synced', {}, { timeout: 3000 });
      expect(badge.tagName).toBe('BUTTON');
      expect(badge.getAttribute('aria-expanded')).toBe('false');
      expect(badge.textContent).toMatch(/آخرین همگام‌سازی:/);
      expect(screen.queryByTestId('last-synced-detail')).toBeNull();

      // کلیک → جزئیات تاریخ کامل (شمسی + میلادی)؛ کلیک دوم → toggle واقعی
      await userEvent.setup().click(badge);
      expect(screen.getByTestId('last-synced').getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('last-synced-detail').textContent).toMatch(/میلادی:/);
      await userEvent.setup().click(screen.getByTestId('last-synced'));
      expect(screen.queryByTestId('last-synced-detail')).toBeNull();

      cleanup(); // هر صفحه با رندر تمیزِ خودش — نشت state بین مسیرها نباشد
    }
  });

  it('بدون همگام‌سازیِ قبلی، نشان پنهان می‌ماند (زمانِ غلط نمایش داده نمی‌شود)', async () => {
    renderApp('/backups');
    await screen.findByText('مدیریت پشتیبان‌ها', {}, { timeout: 3000 });
    expect(screen.queryByTestId('last-synced')).toBeNull();
  });
});
