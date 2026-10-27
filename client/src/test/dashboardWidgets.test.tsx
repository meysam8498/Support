// ============================================================
// تست RTL تخته‌ی ویجت‌های داشبورد (الگوی Microsoft CRM) روی صفحه‌ی واقعی
// ------------------------------------------------------------
// • ترتیب پیش‌فرض هر ۱۱ ویجت (شامل دو کارت ادمین: بکاپ/کلیدها)
// • حالت سفارشی‌سازی: دکمه‌های ↑/↓ کیبوردی → جابه‌جایی واقعی + ذخیره در localStorage
// • کشیدن و رها کردن واقعی HTML5 (dragstart → dragover → drop با dataTransfer) — خارج از
//   حالت ویرایش بی‌اثر است؛ داخل آن جابه‌جایی + اعلام زنده + PUT ذخیره روی سرور
// • مخفی‌کردن با دکمه‌ی چشم + بازگردانی از «ویجت‌های مخفی‌شده»
// • «بازگشت به پیش‌فرض» بعد از جابه‌جایی/مخفی‌کردن
// • ماندگاری چیدمان بین دو بار رندر (کلید per-user در localStorage)
// داده‌ها از mock آفلاین fetch (apiMock با کاربر ادمین) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

/** المانِ ویجت رندرشده (div شبکه با data-widget-id) */
const widgetEl = (container: HTMLElement, id: string): HTMLElement => {
  const el = container.querySelector(`[data-widget-id="${id}"]`);
  if (!el) throw new Error(`ویجت «${id}» در تخته رندر نشده است.`);
  return el as HTMLElement;
};

/**
 * dataTransfer واقع‌گرایانه برای رویدادهای HTML5 دراگ‌اند‌دراپ — jsdom خودش
 * DataTransfer ندارد؛ شیء کاملی با store درونی می‌سازیم تا setData/getData
 * همانند مرورگر واقعی کار کنند (ریکورد انتقال، نه شیء خالی).
 */
function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    getData: (format: string) => store.get(format) ?? '',
    setData: (format: string, value: string) => { store.set(format, value); },
    clearData: () => { store.clear(); },
    setDragImage: () => { /* noop در jsdom */ },
    get types() { return [...store.keys()]; },
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
  } as unknown as DataTransfer;
}

/**
 * ساخت رویداد drag با dataTransfer معتبر روی‌اش (DragEvent اگر jsdom داشته باشد،
 * وگرنه Event با حباب/قابل‌لغو) — رویداد پس از پخش defaultPrevented را برمی‌گرداند
 * تا معلوم شود handler واقعاً جلوی رفتار پیش‌فرض را گرفته است.
 */
function fireDrag(el: Element, type: string, dataTransfer: DataTransfer): Event {
  const ev: Event =
    typeof DragEvent !== 'undefined'
      ? new DragEvent(type, { bubbles: true, cancelable: true })
      : new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer, configurable: true });
  fireEvent(el, ev);
  return ev;
}

/** ثبت‌های fetch را خالی می‌کند (فقط دفتر فراخوانی‌ها؛ رفتار mock دست نمی‌خورد) */
const resetFetchCalls = () => (globalThis.fetch as unknown as { mockClear?: () => void }).mockClear?.();

/** همه‌ی PUTهای ذخیره‌ی چیدمان که به سرور رفته‌اند */
const layoutPutCalls = (): [string, RequestInit | undefined][] => {
  const fn = globalThis.fetch as unknown as { mock?: { calls: [string, RequestInit | undefined][] } };
  return (fn.mock?.calls ?? []).filter(
    ([input, init]) => init?.method === 'PUT' && input.endsWith('/dashboard/layout'),
  );
};

/** تا پایان همگام‌سازی آغازین صبر کن — نشان‌گر «در حال ذخیره روی سرور» باید برود */
const waitInitialSync = () => waitFor(() => expect(screen.queryByText(/در حال ذخیره روی سرور/)).toBeNull());

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

  it('کشیدن و رها کردن واقعی ویجت (HTML5 drag & drop) → جابه‌جایی + اعلام زنده + PUT روی سرور', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();
    await waitInitialSync(); // همگام‌سازی آغازین تمام — race با setState اولیه نداریم
    resetFetchCalls();

    const source = widgetEl(container, 'stats'); // «کارت‌های آمار»
    const target = widgetEl(container, 'progress'); // «سهم قطعات فعال از کل»
    const dt = createDataTransfer();

    // بیرون از حالت ویرایش: کشیدن اثری ندارد — handlerها نصب نیستند (onDrop پیش‌فرض لغو نمی‌شود)
    expect(source.getAttribute('draggable')).not.toBe('true');
    fireDrag(source, 'dragstart', dt);
    expect(dt.getData('text/plain')).toBe(''); // setData صدا نخورده → onDragStart اجرا نشده
    const inertDrop = fireDrag(target, 'drop', dt);
    expect(inertDrop.defaultPrevented).toBe(false);
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]);

    // ورود به حالت سفارشی‌سازی → ویجت‌ها قابل‌کشیدن می‌شوند
    await u.click(customizeBtn());
    expect(widgetEl(container, 'stats').getAttribute('draggable')).toBe('true');

    // dragstart: شناسه در dataTransfer ثبت می‌شود (الزام فایرفاکس) + تأثیر move + هایلایت مبدأ
    fireDrag(source, 'dragstart', dt);
    expect(dt.getData('text/plain')).toBe('stats');
    expect(dt.effectAllowed).toBe('move');
    expect(source.className).toContain('opacity-50');

    // dragover: جلوی رفتار پیش‌فرض گرفته می‌شود (ریختن مجاز) + dropEffect + هایلایت مقصد (کادر برند)
    const overEv = fireDrag(target, 'dragover', dt);
    expect(overEv.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
    expect(target.className).toContain('border-brand-500');

    // drop: جابه‌جایی واقعی — stats از جایش درمی‌آید و درست بعد از progress می‌نشیند
    const dropEv = fireDrag(target, 'drop', dt);
    expect(dropEv.defaultPrevented).toBe(true);
    const expected = [...DEFAULT_ORDER];
    expected.splice(expected.indexOf('stats'), 1);
    expected.splice(expected.indexOf('progress') + 1, 0, 'stats');
    expect(expected).not.toEqual([...DEFAULT_ORDER]); // خودِ انتظار واقعاً جابه‌جاست
    expect(boardOrder(container)).toEqual(expected);
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}').order).toEqual(expected);

    // ادامه‌ی asyncِ pushToServer (updated_at + نشانگر «همگام») زیر act انجام می‌شود
    // تا state updateای بیرون از act نماند (هشدار React) — رفتار خود تخته دست نمی‌خورد
    await act(async () => { /* flush microtaskهای مانده‌ی fetch */ });

    // اعلام صفحه‌خوان رهاکردن + پاک‌شدن هایلایت‌های دراگ
    expect(screen.getByText('«کارت‌های آمار» به جای «سهم قطعات فعال از کل» منتقل شد.')).toBeTruthy();
    expect(source.className).not.toContain('opacity-50');
    expect(target.className).not.toContain('border-brand-500');

    // همگام‌سازی: همان ترتیب با PUT روی سرور رفته است (سرور منبع حقیقت) —
    // فراخوانی fetch هنگام drop ثبت شده؛ فقط متن body را هم می‌خوانیم
    const puts = layoutPutCalls();
    expect(puts.length).toBeGreaterThan(0);
    const body = JSON.parse(String(puts[puts.length - 1][1]?.body)) as { order: string[]; hidden: string[] };
    expect(body.order).toEqual(expected);
    expect(body.hidden).toEqual([]);

    // دراگِ تمام‌شده: dragover جدید بدون dragstart هایلایتی نمی‌سازد (dragId پاک شده)
    fireDrag(target, 'dragover', createDataTransfer());
    expect(target.className).not.toContain('border-brand-500');
  });

  it('رها کردن ویجت روی خودش → بدون جابه‌جایی و بدون هایلایت مقصد', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    await u.click(customizeBtn());

    const el = widgetEl(container, 'stats');
    const dt = createDataTransfer();
    fireDrag(el, 'dragstart', dt);

    // مقصد همان مبدأ است → onDragOver زودتر برمی‌گردد و جلوی رفتار پیش‌فرض نمی‌گیرد
    const overEv = fireDrag(el, 'dragover', dt);
    expect(overEv.defaultPrevented).toBe(false);
    expect(el.className).not.toContain('border-brand-500');

    fireDrag(el, 'drop', dt);
    // flush ادامه‌ی pushToServer زیر act — بدون هشدار state update بیرون از act
    await act(async () => { /* flush microtaskهای مانده‌ی fetch */ });
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]);
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}').order).toEqual([...DEFAULT_ORDER]);
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
