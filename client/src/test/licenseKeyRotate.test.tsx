// ============================================================
// تست ایزوله‌ی دکمه‌ی «چرخش کلید» در کارت داشبورد (فقط ادمین)
// ------------------------------------------------------------  
// • confirm مثبت → POST /license/keys/rotate → جعبه‌ی سبز «چرخش انجام شد»
//   + kid قدیمی/جدید + راهنمای بعد از چرخش (guide از سرور) + تازه‌سازی وضعیت
// • confirm منفی → بدون هیچ درخواست چرخشی (گیت ایمنی)
// متن confirm از منبع واحد lib/keyRotationGuide (همان در پنل ساخت لایسنس).
// ============================================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderApp } from './renderApp';
import { overrideRoute, clearRouteOverrides } from './apiMock';

const ROTATION_RESPONSE = {
  ok: true,
  old_kid: 'aabbccdd',
  new_kid: '11223344',
  accepted_kids: ['11223344', 'aabbccdd'],
  current_kid: '11223344',
  rotated_at: '2026-10-18T10:00:00.000Z',
  guide: [
    'فایل‌های keys/ را روی سرورهای دیگر کپی کنید.',
    'کدهای صادرشده‌ی قبلی معتبر می‌مانند.',
  ],
};

const KEYS_STATUS_AFTER = {
  current_kid: '11223344',
  accepted_kids: ['11223344', 'aabbccdd'],
  accepted_count: 2,
  has_issue_key: true,
  keys_dir: '/keys',
};

describe('چرخش کلید امضا از کارت داشبورد', () => {
  afterEach(() => {
    clearRouteOverrides();
    vi.restoreAllMocks();
    cleanup();
  });

  it('confirm مثبت → چرخش + جعبه‌ی راهنمای بعد از چرخش (kid قدیمی/جدید + guide سرور)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let rotateCalls = 0;
    overrideRoute('POST', /^\/license\/keys\/rotate$/, () => { rotateCalls++; return ROTATION_RESPONSE; });
    overrideRoute('GET', /^\/license\/keys\/status$/, () => KEYS_STATUS_AFTER);
    // تاریخچه با kidهای متمایز تا با kidهای جعبه‌ی نتیجه قاطی نشود
    overrideRoute('GET', /^\/license\/keys\/rotations$/, () => ({
      path: '/keys/rotations.jsonl', exists: true, count: 1, invalid_lines: 0, current_kid: '11223344',
      rotations: [{ rotated_at: '2026-10-01T10:00:00.000Z', old_kid: '99887766', new_kid: '55667788', archive_ok: true, by: 'admin-panel' }],
    }));

    renderApp('/');
    const btn = await screen.findByRole('button', { name: /چرخش کلید/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);

    // confirm صدا زده شد و چرخش دقیقاً یک بار رفت
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(rotateCalls).toBe(1);

    // جعبه‌ی سبز نتیجه + kid قدیمی/جدید — و تازه‌شدن kid جاری در سردر کارت (بعد از چرخش status دوباره خوانده شد)
    expect(await screen.findByText(/چرخش انجام شد/)).toBeTruthy();
    expect(screen.getByText('aabbccdd')).toBeTruthy();
    expect(screen.getAllByText('11223344').length).toBeGreaterThanOrEqual(2);

    // راهنمای بعد از چرخش — همان متن guide سرور (details باز/بسته فرقی در DOM ندارد)
    expect(screen.getByText(/فایل‌های keys\/ را روی سرورهای دیگر کپی کنید/)).toBeTruthy();
    expect(screen.getByText(/کدهای صادرشده‌ی قبلی معتبر می‌مانند/)).toBeTruthy();
    // ارجاع به تست صدور با کلید جدید در پنل ساخت لایسنس
    expect(screen.getByText(/صدور کد آزمایشی با کلید جدید/)).toBeTruthy();
  });

  it('confirm منفی → بدون درخواست چرخش (گیت ایمنی)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let rotateCalls = 0;
    overrideRoute('POST', /^\/license\/keys\/rotate$/, () => { rotateCalls++; return ROTATION_RESPONSE; });

    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: /چرخش کلید/ }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(rotateCalls).toBe(0);
    expect(screen.queryByText(/چرخش انجام شد/)).toBeNull();
  });
});
