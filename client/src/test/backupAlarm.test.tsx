// ============================================================
// تست ایزوله‌ی مسیر خطای آژیر بکاپ در داشبورد — PipelinePro
// ------------------------------------------------------------  
// • مسیر خطا (GET /backups با lastResult.ok=false): نشان قرمز (coral) با نقطه‌ی
//   نبض‌دار animate-siren-pulse + متن «آخرین تلاش ناموفق»
// • مسیر خطای دکمه‌ی «بکاپ فوری» (POST /backups/run با ok:false): بنر قرمز
//   Alert با role=alert و متن خطای سرور
// • کنترل: بکاپ سالم → نشان سبدز بدون هیچ پالسی (پالس فقط برای خطا)
// داده‌ها با overrideRoute (apiMock) روی همان mock سراسری بازنویسی می‌شوند؛
// بقیه‌ی مسیرها fixtures پیش‌فرض را می‌بینند تا تست واقعاً ایزوله بماند.
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderApp } from './renderApp';
import { overrideRoute, clearRouteOverrides } from './apiMock';

/** بکاپِ «تازه و سالم» — پایه‌ی هر دو سناریو (خطا/کنترل) */
const healthyBackup = {
  dir: '/data/backups',
  keep: 30,
  atHour: 3,
  lastRun: new Date(Date.now() - 3600 * 1000).toISOString(), // ۱ ساعت پیش → عقب‌افتاده نیست
  lastResult: { ok: true, file: 'support-backup-x.db', sizeBytes: 2048, integrity: 'ok', push: { ok: true, target: '', kind: 'dir' } },
  count: 2,
  push: { target: '', enabled: false, last: null },
  items: [],
  history: [],
  history_meta: { total: 2, keep: 500, capped: false },
};

/** همان بکاپ ولی با شکست واقعی آخرین اجرا — مسیر خطای آژیر */
const failedBackup = {
  ...healthyBackup,
  lastResult: { ...healthyBackup.lastResult, ok: false, error: 'دیسک مقصد پر است' },
};

async function settle() {
  // صبر تا کارت بکاپ (فقط ادمین) بعد از fetch وضعیت رندر شود
  await waitFor(() => expect(screen.getByText('آخرین پشتیبان‌گیری')).toBeTruthy(), { timeout: 5000 });
}

describe('آژیر بکاپ — مسیر خطا (بنر قرمز + پالس)', () => {
  afterEach(() => {
    clearRouteOverrides();
    cleanup();
  });

  it('آخرین بکاپ ناموفق → نشان قرمز «بکاپ ناموفق!» با نقطه‌ی نبض‌دار', async () => {
    overrideRoute('GET', /^\/backups$/, () => failedBackup);
    renderApp('/');
    await settle();

    // برچسب آژیر قرمز (coral) ظاهر می‌شود — با title یکتای خودش پیدا می‌شود
    // (نه findByText: متنِ زیرمجموعه‌ها را ancestorها هم match می‌کنند و چندتایی می‌شود)
    const badge = await screen.findByTitle(/آژیر وضعیت بکاپ/);
    expect(badge.textContent).toMatch(/بکاپ ناموفق!/);
    expect(badge.className).toContain('text-coral-dark'); // قرمز = خطای واقعی (قانون PipelinePro)

    // نقطه‌ی وضعیت پالس می‌زند (animate-siren-pulse) و قرمز است
    const dot = badge.querySelector('span');
    expect(dot, 'نقطه‌ی آژیر باید داخل برچسب باشد').not.toBeNull();
    expect(dot!.className).toContain('animate-siren-pulse');
    expect(dot!.className).toContain('bg-coral');

    // متن همراه: آخرین تلاش ناموفق روی کارت دیده می‌شود (حداقل یک گره — span داخل p)
    expect(screen.getAllByText(/آخرین تلاش ناموفق/).length).toBeGreaterThan(0);
  });

  it('دکمه‌ی «بکاپ فوری» با پاسخ ناموفق سرور → بنر قرمز Alert با role=alert', async () => {
    overrideRoute('GET', /^\/backups$/, () => healthyBackup);
    overrideRoute('POST', /^\/backups\/run$/, () => ({ ok: false, error: 'دیسک مقصد پر است' }));
    renderApp('/');
    await settle();

    fireEvent.click(screen.getByRole('button', { name: /بکاپ فوری/ }));

    // پیام خطر با متن خطای سرور — روی همان کارت بکاپ (بنر قرمز Alert با role=alert)
    await waitFor(
      () => expect(screen.getAllByRole('alert').some((b) => b.textContent?.includes('بکاپ ناموفق بود: دیسک مقصد پر است'))).toBe(true),
      { timeout: 5000 },
    );
    const banner = screen.getAllByRole('alert').find((b) => b.textContent?.includes('بکاپ ناموفق بود'))!;
    expect(banner.className).toContain('form-banner-error'); // استایل قرمز منبع واحد (Alert danger)
  });

  it('سقف تاریخچه‌ی بکاپ پر شده → هشدار طلایی «قدیمی‌ترین‌ها حذف می‌شوند»', async () => {
    // وقتی جدول به HISTORY_KEEP برسد، هر اجرای جدید قدیمی‌ترین ردیف را حذف می‌کند — UI باید هشدار دهد
    overrideRoute('GET', /^\/backups$/, () => ({
      ...healthyBackup,
      history_meta: { total: 500, keep: 500, capped: true },
    }));
    renderApp('/');
    await settle();

    const warn = await screen.findByText(/سقف تاریخچه/);
    expect(warn.textContent).toContain('پر شد');
    expect(warn.textContent).toContain('حذف');
    expect(warn.className).toContain('text-gold-dark'); // طلایی = فوریت/اطلاع (قرمز فقط خطای واقعی)
  });

  it('کنترل: سقف پر نیست → بدون هشدار سقف تاریخچه', async () => {
    overrideRoute('GET', /^\/backups$/, () => healthyBackup); // history_meta.capped = false
    renderApp('/');
    await settle();
    await screen.findByTitle(/آژیر وضعیت بکاپ/);
    expect(screen.queryByText(/سقف تاریخچه/)).toBeNull();
  });

  it('صفحه‌ی مدیریت بکاپ‌ها: نمودار تاریخچه + جدول جزئیات اجراها (جدیدترین اول)', async () => {
    overrideRoute('GET', /^\/backups$/, () => ({
      ...healthyBackup,
      history: [
        // حداقل ۲ بکاپ سالم تا نمودار خط رشد را رسم کند (شرط خودِ نمودار)
        { ranAt: '2026-10-16T00:00:00.000Z', source: 'daily', ok: true, file: 'old.db', sizeBytes: 1024, integrity: 'ok', durationMs: 2100, error: null, pushOk: null, pushTarget: null, pushError: null },
        { ranAt: '2026-10-17T00:00:00.000Z', source: 'daily', ok: true, file: 'a.db', sizeBytes: 2048, integrity: 'ok', durationMs: 2500, error: null, pushOk: null, pushTarget: null, pushError: null },
        { ranAt: new Date().toISOString(), source: 'manual', ok: false, file: null, sizeBytes: null, integrity: null, durationMs: 900, error: 'دیسک پر است', pushOk: false, pushTarget: '/mnt/nas', pushError: 'timeout' },
      ],
      history_meta: { total: 2, keep: 500, capped: false },
    }));
    renderApp('/backups');

    // جدول جزئیات: منبع (۲ ردیف روزانه)، نتیجه‌ی ردیف خطا و خطای push خارجی
    expect((await screen.findAllByText('روزانه')).length).toBe(2);
    expect(screen.getByText(/ناموفق — دیسک پر است/)).toBeTruthy();
    expect(screen.getByText(/timeout/)).toBeTruthy();
    // نمودار تاریخچه با نام دسترس‌پذیرش رندر شده است (SVG مشترک داشبورد/بکاپ‌ها)
    expect(screen.getByRole('img', { name: 'نمودار خطی رشد حجم بکاپ‌ها' })).toBeTruthy();
    // دکمه‌ی خروجی PNG (هم‌سبک نمودار روند — exportChartPng مشترک)
    expect(screen.getByRole('button', { name: /خروجی PNG/ })).toBeTruthy();
  });

  it('کنترل: بکاپ سالم → نشان سبز بدون پالس (پالس فقط مخصوص خطا)', async () => {
    overrideRoute('GET', /^\/backups$/, () => healthyBackup);
    renderApp('/');
    await settle();

    const badge = await screen.findByTitle(/آژیر وضعیت بکاپ/);
    expect(badge.textContent).toMatch(/بکاپ سالم/);
    expect(badge.className).toContain('text-green-700');
    expect(badge.querySelector('.animate-siren-pulse'), 'حالت سالم نباید پالس داشته باشد').toBeNull();
  });
});
