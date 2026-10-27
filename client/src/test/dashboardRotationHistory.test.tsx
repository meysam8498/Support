// ============================================================
// لیست فشرده‌ی تاریخچه‌ی چرخش کلید در کارت داشبورد
// ------------------------------------------------------------
// • سقف ۵ سطر آخر (جدیدترین اول) از GET /license/keys/rotations
// • سطر اضافه‌ی «و N چرخش دیگر…» با پیوند به پنل مدیریت کلیدها
// • برچسب خوانای عامل چرخش (admin-panel → پنل ادمین) + وضعیت بایگانی
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderApp } from './renderApp';
import { overrideRoute, clearRouteOverrides } from './apiMock';

/** ۷ سطر تاریخچه — جدیدترین اول (همان ترتیبی که سرور از rotations.jsonl می‌دهد) */
const ROTATIONS = Array.from({ length: 7 }, (_, i) => ({
  rotated_at: `2026-10-0${7 - i}T10:00:00.000Z`,
  old_kid: `a000000${i}`,
  new_kid: `b000000${i}`,
  archive_ok: i !== 6, // آخرین سطر عمداً بایگانی‌مفقود تا هر دو حالت نمایش داده شود
  by: i % 2 === 0 ? 'admin-panel' : 'ssh',
}));

describe('لیست فشرده‌ی تاریخچه‌ی چرخش در کارت داشبورد', () => {
  afterEach(() => {
    clearRouteOverrides();
    cleanup();
  });

  it('۵ سطر آخر را جدیدترین اول نشان می‌دهد و باقی‌مانده را خط «و N چرخش دیگر» می‌شمارد', async () => {
    overrideRoute('GET', /^\/license\/keys\/rotations$/, () => ({
      path: '/keys/rotations.jsonl', exists: true, count: ROTATIONS.length, invalid_lines: 0, current_kid: 'a0000006',
      rotations: ROTATIONS,
    }));

    const { container } = renderApp('/');
    await screen.findByText('آخرین چرخش‌ها:');

    const ul = container.querySelector('ul[title*="rotations.jsonl"]');
    expect(ul).toBeTruthy();
    const lis = Array.from(ul!.querySelectorAll(':scope > li'));
    // ۱ سربرگ + ۵ سطر نمایش‌داده‌شده + ۱ خط باقی‌مانده
    expect(lis).toHaveLength(7);

    // سقف نمایش: سطرهای ۰..۴ هستند، سطرهای ۵ و ۶ نه
    const body = lis.slice(1, 6);
    for (let i = 0; i < 5; i++) expect(body[i].textContent).toContain(`a000000${i}`);
    expect(ul!.textContent).not.toContain('a0000005');
    expect(ul!.textContent).not.toContain('a0000006');

    // ترتیب: جدیدترین (ردیف اول) بالاتر از قدیمی‌ترین سطرِ نمایش‌داده‌شده — در کل لیست
    expect(body[0].textContent).toContain('a0000000');
    expect(body[4].textContent).toContain('a0000004');
    const ulText = ul!.textContent!;
    expect(ulText.indexOf('a0000000')).toBeLessThan(ulText.indexOf('a0000004'));

    // خط باقی‌مانده: ۲ تا (۷ − ۵) + پیوند مدیریت کلیدها
    expect(lis[6].textContent).toMatch(/و ۲ چرخش دیگر/);
    expect(lis[6].querySelector('a[href="/issue"]')).toBeTruthy();

    // برچسب خوانای عامل + وضعیت بایگانی (هم سبز هم مفقود)
    expect(body[0].textContent).toContain('پنل ادمین');
    expect(body[1].textContent).toContain('ssh');
    expect(body[0].textContent).toContain('✓ بایگانی');
    expect(body[3].textContent).toContain('✓ بایگانی');
  });

  it('بدون هیچ چرخش ثبت‌شده‌ای، لیست و خط اضافه رندر نمی‌شوند (همان متن راهنمای خالی می‌ماند)', async () => {
    overrideRoute('GET', /^\/license\/keys\/rotations$/, () => ({
      path: '/keys/rotations.jsonl', exists: false, count: 0, invalid_lines: 0, current_kid: 'aabbccdd',
      rotations: [],
    }));

    const { container } = renderApp('/');
    await screen.findByText(/هنوز چرخشی ثبت نشده/);

    expect(screen.queryByText('آخرین چرخش‌ها:')).toBeNull();
    expect(container.querySelector('ul[title*="rotations.jsonl"]')).toBeNull();
  });
});
