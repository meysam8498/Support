// ============================================================
// تست‌های تعاملی دسترس‌پذیری (a11y) با کیبورد — فوکوس، ترتیب Tab، منوها و دیالوگ‌ها
// ------------------------------------------------------------
// این فایل مکمل a11y.test.tsx است: آنجا ساختار ایستا (axe روی صفحات) سنجیده
// می‌شود، اینجا رفتار واقعی تعامل با کیبورد روی DOM رندرشده (user-event):
//   • ترتیب Tab در هدر — همان ترتیب بصری/RTL (لوگو → ناوبری → همبرگر → جست‌وجو → بج → تم → منوی کاربر)
//   • منوهای کشویی (تم/کاربر): باز شدن با Enter، فوکوس اولین آیتم، جابه‌جایی با
//     Arrow/Home/End و بستن با Escape + بازگرداندن فوکوس به دکمه‌ی راه‌انداز
//   • منوی موبایل (همبرگر): aria-expanded + بستن با Escape و بازگشت فوکوس
//   • دیالوگ (خروجی اکسل): role=dialog/aria-modal/عنوان مرتبط، فوکوس اولیه داخل
//     پنل، تله‌ی فوکوس Tab/Shift+Tab و بازگشت فوکوس به عامل بازکننده
//   • جست‌وجوی سراسری: Ctrl+K، جابه‌جایی نتایج با Arrow، Enter برای ناوبری
// داده‌ها از mock آفلاین fetch (apiMock) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';
import { overrideRoute, clearRouteOverrides } from './apiMock';

/** دکمه‌ی راه‌انداز منوی تم */
const themeTrigger = () => screen.getByRole('button', { name: 'تغییر تم' });
/** دکمه‌ی راه‌انداز منوی کاربر — برچسب صریح برای صفحه‌خوان */
const userTrigger = () => screen.getByRole('button', { name: 'منوی کاربر' });
/** دکمه‌ی همبرگر موبایل */
const burger = () => screen.getByRole('button', { name: 'منو' });

describe('تعامل کیبورد — ترتیب Tab در هدر', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  it('Tab به‌ترتیب بصری/RTL: لوگو → لینک‌های ناوبری → همبرگر → جست‌وجو → بج لایسنس → تم → منوی کاربر', async () => {
    const u = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'تغییر تم' });

    // عناصر مورد انتظار به همان ترتیبی که در DOM/بصره چیده شده‌اند (شامل دو لینک نقش‌دار ادمین: لیست‌ها / ورود سریال)
    // لینک‌های ناوبری با title دقیقشان پیدا می‌شوند — nameشان با کارت‌های داشبورد مشترک است
    const expected: HTMLElement[] = [
      screen.getByRole('link', { name: /سامانه مدیریت تجهیزات/ }), // لوگو
      screen.getByTitle('داشبورد'),
      screen.getByTitle('تجهیزات'),
      screen.getByTitle('قطعات'),
      screen.getByTitle('گارنتی و تعویض'), // t.navWarranty = «گارنتی و تعویض»
      screen.getByTitle('گزارش‌ها'),
      screen.getByTitle('مدیریت لیست‌ها'),
      screen.getByTitle('ورود سریال از اکسل'),
      burger(),
      screen.getByPlaceholderText(/جست‌وجو/),
      screen.getByRole('button', { name: /یک‌ساله/ }), // بج لایسنس
      themeTrigger(),
      userTrigger(),
    ];

    for (const el of expected) {
      await u.tab();
      expect(document.activeElement, `فوکوس باید روی ${el.getAttribute('aria-label') || el.textContent?.slice(0, 20)} باشد`).toBe(el);
    }
  });
});

describe('تعامل کیبورد — منوی تم', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  it('Enter باز می‌کند، فوکوس اولین گزینه، Arrow/Home/End جابه‌جا، Escape می‌بندد و فوکوس برمی‌گردد', async () => {
    const u = userEvent.setup();
    renderApp('/');
    const trigger = themeTrigger();
    trigger.focus();
    await u.keyboard('{Enter}');

    // باز شدن + فوکوس اولین آیتم + aria-expanded
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios).toHaveLength(3); // روشن/تاریک/سیستم
    expect(document.activeElement).toBe(radios[0]);

    // جابه‌جایی با Arrow + سرها با Home/End
    await u.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radios[1]);
    await u.keyboard('{ArrowUp}{ArrowUp}'); // از اولی wrap به آخری
    expect(document.activeElement).toBe(radios[2]);
    await u.keyboard('{Home}');
    expect(document.activeElement).toBe(radios[0]);
    await u.keyboard('{End}');
    expect(document.activeElement).toBe(radios[2]);

    // Escape می‌بندد + فوکوس به دکمه‌ی راه‌انداز
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('انتخاب «تاریک» با Enter — تم عوض می‌شود و منو می‌بندد (aria-checked به‌روز)', async () => {
    const u = userEvent.setup();
    renderApp('/');
    themeTrigger().focus();
    await u.keyboard('{Enter}');

    const dark = screen.getByRole('menuitemradio', { name: /تاریک/ });
    dark.focus();
    await u.keyboard('{Enter}');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('تعامل کیبورد — منوی کاربر', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  it('Enter باز می‌کند (آیتم‌ها menuitem)، فوکوس اولین آیتم، End به آخر، Escape + بازگشت فوکوس', async () => {
    const u = userEvent.setup();
    renderApp('/');
    const trigger = userTrigger();
    trigger.focus();
    await u.keyboard('{Enter}');

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(3); // درباره/لایسنس/کاربران/بکاپ/… + خروج
    expect(document.activeElement).toBe(items[0]);

    await u.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await u.keyboard('{End}');
    expect(document.activeElement).toBe(items[items.length - 1]); // خروج

    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('تعامل کیبورد — منوی موبایل (همبرگر)', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  it('Enter باز/بسته می‌کند، aria-expanded درست، Escape می‌بندد و فوکوس برمی‌گردد', async () => {
    const u = userEvent.setup();
    renderApp('/');
    const btn = burger();
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    btn.focus();
    await u.keyboard('{Enter}');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const drawer = document.getElementById('mobile-nav');
    expect(drawer).toBeTruthy();
    // لینک‌های کشویی داخل DOM و قابل فوکوس
    const links = drawer!.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(5);

    await u.keyboard('{Escape}');
    expect(document.getElementById('mobile-nav')).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });
});

describe('تعامل کیبورد — دیالوگ (خروجی اکسل تعویض‌ها)', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  async function openExportDialog(u: ReturnType<typeof userEvent.setup>) {
    renderApp('/reports');
    const opener = await screen.findByRole('button', { name: /خروجی اکسل تعویض‌ها/ });
    await u.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'خروجی اکسل تعویض‌ها' });
    return { opener, dialog };
  }

  it('semantics درست (role=dialog, aria-modal, عنوان مرتبط) + فوکوس اولیه داخل پنل', async () => {
    const u = userEvent.setup();
    const { dialog } = await openExportDialog(u);

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    // فوکوس اولیه: اولین قابل‌فوکوس داخل پنل = دکمه‌ی بستن
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('بستن');
  });

  it('تله‌ی فوکوس: Tab و Shift+Tab داخل پنل حلقه می‌زنند — فوکوس هرگز بیرون نمی‌رود', async () => {
    const u = userEvent.setup();
    const { dialog } = await openExportDialog(u);

    // ۱۵ تب رو به جلو — در هر گام فوکوس باید داخل پنل بماند (حتی از آخرین آیتم)
    for (let i = 0; i < 15; i++) {
      await u.tab();
      expect(dialog.contains(document.activeElement), `Tab شماره ${i + 1} فوکوس را از دیالوگ برد`).toBe(true);
    }
    // Shift+Tab برگشتی — باز هم داخل پنل
    for (let i = 0; i < 15; i++) {
      await u.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab شماره ${i + 1} فوکوس را از دیالوگ برد`).toBe(true);
    }
  });

  it('Escape می‌بندد و فوکوس به عامل بازکننده برمی‌گردد', async () => {
    const u = userEvent.setup();
    const { opener, dialog } = await openExportDialog(u);
    expect(dialog).toBeTruthy();

    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('تعامل کیبورد — جست‌وجوی سراسری', () => {
  afterEach(() => { clearRouteOverrides(); cleanup(); });

  it('Ctrl+K فوکوس می‌کند؛ Arrow نتیجه را فعال می‌کند؛ Enter ناوبری می‌کند', async () => {
    const u = userEvent.setup();
    overrideRoute('GET', /^\/search/, () => ({
      q: 'SN-0001',
      hits: [
        { type: 'device', id: 1, label: 'SN-0001', sub: 'پروژه‌ی تست — سرور R650', link: '/devices/1', badge: 'تجهیز' },
        { type: 'part', id: 1, label: 'PN-001', sub: 'SN-0001', link: '/parts/1', badge: 'قطعه' },
      ],
      groups: [{ type: 'device', title: 'تجهیزات', count: 1 }, { type: 'part', title: 'قطعات', count: 1 }],
      empty: false,
      type_counts: { device: 1, part: 1 },
    }));

    renderApp('/');

    // Ctrl+K فوکوس را روی باکس جست‌وجو می‌برد
    await u.keyboard('{Control>}k{/Control}');
    const input = screen.getByPlaceholderText(/جست‌وجو/);
    expect(document.activeElement).toBe(input);

    // تایپ → بعد از debounce نتایج باز می‌شوند (عبارت عمداً یکتاست: SN-0001 در sub دومی هم هست)
    await u.type(input, 'SN-0001');
    const firstHit = await screen.findByRole('button', { name: /پروژه‌ی تست — سرور R650/ });

    // ArrowDown اولین نتیجه را فعال می‌کند و Enter ناوبری می‌کند
    await u.keyboard('{ArrowDown}');
    expect(firstHit.className).toContain('bg-brand-50'); // هایلایت نتیجه‌ی فعال
    await u.keyboard('{Enter}');
    // ناوبری واقعی به صفحه‌ی جزئیات همان hit
    expect(await screen.findByRole('heading', { name: 'جزئیات تجهیز' })).toBeTruthy();
  });

  it('Escape نتایج جست‌وجو را می‌بندد (بدون خروج از باکس)', async () => {
    const u = userEvent.setup();
    overrideRoute('GET', /^\/search/, () => ({
      q: 'SN',
      hits: [{ type: 'device', id: 1, label: 'SN-0001', sub: 'x', link: '/devices/1', badge: 'تجهیز' }],
      groups: [{ type: 'device', title: 'تجهیزات', count: 1 }],
      empty: false,
      type_counts: { device: 1 },
    }));

    renderApp('/');
    const input = screen.getByPlaceholderText(/جست‌وجو/);
    await u.click(input);
    await u.type(input, 'SN');
    await screen.findByRole('button', { name: /SN-0001/ });

    await u.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /SN-0001/ })).toBeNull();
    // فوکوس هنوز روی باکس است — آماده‌ی تایپ دوباره
    expect(document.activeElement).toBe(input);
  });
});
