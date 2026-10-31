// ============================================================
// تست RTL تخته‌ی ویجت‌های داشبورد (الگوی Microsoft CRM) روی صفحه‌ی واقعی
// ------------------------------------------------------------
// • ترتیب پیش‌فرض هر ۱۱ ویجت (شامل دو کارت ادمین: بکاپ/کلیدها)
// • حالت سفارشی‌سازی: دکمه‌های ↑/↓ کیبوردی → جابه‌جایی واقعی + ذخیره در localStorage
// • کشیدن و رها کردن واقعی HTML5 (dragstart → dragover → drop با dataTransfer) — خارج از
//   حالت ویرایش بی‌اثر است؛ داخل آن جابه‌جایی + اعلام زنده + PUT ذخیره روی سرور
// • جلسه‌ی کامل تعاملی: چند درگ متوالی با عبور hover از میانه‌ها، پایان ویرایش و یک PUT جمع‌شده (debounce)
// • debounce ذخیره‌ی سروری (۱.۳۳): درگ‌های پشت‌سرهم به‌جای n تا PUT، یک PUT با چیدمان نهایی
// • تداخل ۴۰۹ از دستگاه دیگر: سرور رد می‌کند، تخته نسخه‌ی سرور را می‌خواند و اعمال می‌کند
// • نشان «آخرین همگام‌سازی: HH:MM:SS» کنار نشان‌گر وضعیت، بعد از هر همگام‌سازی موفق
// • گزارش PUTهای ناموفق: شمارش (فارسی) + کلیک → جزئیات دلیل (شبکه/سرور یا تداخل ۴۰۹)
// • نشان‌های وضعیت (آفلاین/در حال ذخیره) هم قابل‌کلیک‌اند → جزئیات با aria-expanded — زنجیره‌ی یکنواخت
// • حالت آفلاین: نشان «n تغییر ثبت‌نشده در صف» + رویداد online → همه در یک PUT
// • مخفی‌کردن با دکمه‌ی چشم + بازگردانی از «ویجت‌های مخفی‌شده»
// • «بازگشت به پیش‌فرض» بعد از جابه‌جایی/مخفی‌کردن
// • ماندگاری چیدمان بین دو بار رندر (کلید per-user در localStorage)
// داده‌ها از mock آفلاین fetch (apiMock با کاربر ادمین) می‌آیند — بدون شبکه.
// ============================================================
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';
import { clearRouteOverrides, overrideRoute } from './apiMock';
import { DEFAULT_ORDER, lastSyncedKeyFor, layoutKeyFor, readLastSynced } from '../lib/dashboardLayout';
import { JALALI_MONTHS } from '../lib/date';

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
  beforeEach(() => {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(lastSyncedKeyFor(LAYOUT_KEY)); // زمانِ ماندگارِ صفحات دیگر
  });
  afterEach(() => {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(lastSyncedKeyFor(LAYOUT_KEY));
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
    // ذخیره‌ی سروری debounce شده است (SAVE_DEBOUNCE_MS) — PUT بعد از ۶۵۰ms سکوت می‌رود
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    await act(async () => { /* flush state updateهای بعد از resolve شد */ });

    // اعلام صفحه‌خوان رهاکردن + پاک‌شدن هایلایت‌های دراگ
    expect(screen.getByText('«کارت‌های آمار» به جای «سهم قطعات فعال از کل» منتقل شد.')).toBeTruthy();
    expect(source.className).not.toContain('opacity-50');
    expect(target.className).not.toContain('border-brand-500');

    // همگام‌سازی: همان ترتیب با PUT روی سرور رفته است (سرور منبع حقیقت) —
    // فراخوانی fetch هنگام drop ثبت شده؛ فقط متن body را هم می‌خوانیم
    const puts = layoutPutCalls();
    const body = JSON.parse(String(puts[puts.length - 1][1]?.body)) as { order: string[]; hidden: string[] };
    expect(body.order).toEqual(expected);
    expect(body.hidden).toEqual([]);

    // دراگِ تمام‌شده: dragover جدید بدون dragstart هایلایتی نمی‌سازد (dragId پاک شده)
    fireDrag(target, 'dragover', createDataTransfer());
    expect(target.className).not.toContain('border-brand-500');
  });

  it('جلسه‌ی واقعی سفارشی‌سازی: چند درگ متوالی با عبور از میانه‌ها + پایان ویرایش + دو PUT', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();

    // ورود به حالت ویرایش — تنها جایی که کشیدن مجاز است
    await u.click(customizeBtn());
    expect(customizeBtn().getAttribute('aria-pressed')).toBe('true');

    // ── درگ ۱: «کارت‌های آمار» تا انتهای تخته — در راه روی دو ویجت میانی hover می‌کنیم
    const stats = widgetEl(container, 'stats');
    const hover1 = widgetEl(container, 'trend');
    const hover2 = widgetEl(container, 'topParts');
    const dropEnd = widgetEl(container, 'actions');
    const dt1 = createDataTransfer();

    fireDrag(stats, 'dragstart', dt1);
    expect(dt1.getData('text/plain')).toBe('stats');
    fireDrag(hover1, 'dragover', dt1);
    expect(hover1.className).toContain('border-brand-500'); // هایلایت اولین مقصد میانی
    fireDrag(hover2, 'dragover', dt1);
    // هایلایت «دنبال‌کننده» است: با رفتن روی مقصد بعدی، کادر قبلی پاک می‌شود
    expect(hover1.className).not.toContain('border-brand-500');
    expect(hover2.className).toContain('border-brand-500');

    fireDrag(dropEnd, 'drop', dt1);
    await act(async () => { /* flush میکروتسک‌های pushToServer */ });

    const after1 = [...DEFAULT_ORDER];
    after1.splice(after1.indexOf('stats'), 1);
    after1.splice(after1.indexOf('actions') + 1, 0, 'stats');
    expect(boardOrder(container)).toEqual(after1);
    expect(screen.getByText('«کارت‌های آمار» به جای «میان‌برهای سریع» منتقل شد.')).toBeTruthy();
    // هایلایت‌های دراگ بعد از drop جمع شده‌اند
    expect(hover1.className).not.toContain('border-brand-500');
    expect(hover2.className).not.toContain('border-brand-500');
    expect(stats.className).not.toContain('opacity-50');

    // ── درگ ۲ در همان نشست: «میان‌برهای سریع» را به کنار «آخرین پشتیبان‌گیری» برمی‌گردانیم
    const actions = widgetEl(container, 'actions');
    const dropAt = widgetEl(container, 'backup');
    const dt2 = createDataTransfer();
    fireDrag(actions, 'dragstart', dt2);
    expect(dt2.getData('text/plain')).toBe('actions');
    fireDrag(dropAt, 'dragover', dt2);
    expect(dropAt.className).toContain('border-brand-500');
    fireDrag(dropAt, 'drop', dt2);
    await act(async () => { /* flush */ });

    // قاعده‌ی dropWidget: from حذف می‌شود و به «شاخص اصلیِ» to می‌نشیند — ویجتی که از
    // پایین کشیده شده سمتِ بالایِ مقصد می‌نشیند (کنارِ مقصد، در همان سمتی که آمده)
    const after2 = [...after1];
    after2.splice(after2.indexOf('actions'), 1);
    after2.splice(after2.indexOf('backup'), 0, 'actions');
    expect(boardOrder(container)).toEqual(after2);
    expect(after2).not.toEqual(after1); // دو درگ روی هم جمع شده‌اند
    expect(screen.getByText('«میان‌برهای سریع» به جای «آخرین پشتیبان‌گیری» منتقل شد.')).toBeTruthy();

    // ── پایان ویرایش: کنترل‌ها جمع می‌شوند، کشیدن بی‌اثر می‌شود، ولی چیدمان می‌ماند
    await u.click(customizeBtn());
    expect(customizeBtn().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: /بالاتر/ })).toBeNull();
    expect(widgetEl(container, 'actions').getAttribute('draggable')).not.toBe('true');
    expect(boardOrder(container)).toEqual(after2);

    // ── همگام‌سازیبا debounce: درگ‌های پشت‌سرهم جمع شده‌اند — دقیقاً یک PUT با چیدمانِ نهایی
    // (اگر debounce نبود، اینجا دو PUT مستقل می‌دیدیم؛ بنابراین count==1 اثبات جمع‌شدن است)
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    const puts = layoutPutCalls();
    const last = JSON.parse(String(puts[puts.length - 1][1]?.body)) as { order: string[]; hidden: string[] };
    expect(last.order).toEqual(after2);
    expect(last.hidden).toEqual([]);
    // نشانگر همگام‌سازی به «synced» برگشته — ذخیره‌ی درگ دوم هم رسیده است
    await waitInitialSync();
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

  it('تداخل ۴۰۹ از دستگاه دیگر: سرور رد می‌کند، تخته نسخه‌ی سرور را می‌خواند و اعمال می‌کند', async () => {
    const u = userEvent.setup();

    // «دستگاه دیگر» چیدمان کاملاً متفاوتی نوشته است: actions اول + trend مخفی + updated_at تازه
    const otherSession = {
      order: ['actions', ...DEFAULT_ORDER.filter((id) => id !== 'actions')],
      hidden: ['trend'],
      updated_at: '2026-10-18T07:30:00.000Z',
    };
    // چیدمانی که درگِ Local می‌سازد — باید «نه» این باشد بعد از حل تداخل (اثبات اعمالِ نسخه‌ی سرور)
    const localDragged = [...DEFAULT_ORDER];
    localDragged.splice(localDragged.indexOf('stats'), 1);
    localDragged.splice(localDragged.indexOf('progress') + 1, 0, 'stats');
    expect(localDragged).not.toEqual(otherSession.order); // دو نسخه واقعاً متمایزند

    // PUT محلی ۴۰۹ می‌گیرد (تداخل)؛ GET بعد از ۴۰۹ نسخه‌ی دستگاه دیگر را برمی‌گرداند —
    // خواندنِ آغازین هنوز خالی است ({} بدون order) تا نشست محل حکم اولیه را بگذارد.
    let remoteWon = false;
    overrideRoute('PUT', /^\/dashboard\/layout$/, () => {
      remoteWon = true;
      return { __status: 409, error: 'چیدمان توسط نشست دیگری تغییر کرده است' };
    });
    overrideRoute('GET', /^\/dashboard\/layout$/, () => (remoteWon ? otherSession : {}));

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    expect(boardOrder(container)).toEqual([...DEFAULT_ORDER]); // قبل از تداخل: پیش‌فرض

    await u.click(customizeBtn());
    const dt = createDataTransfer();
    const stats = widgetEl(container, 'stats');
    const target = widgetEl(container, 'progress');
    fireDrag(stats, 'dragstart', dt);
    fireDrag(target, 'dragover', dt);
    fireDrag(target, 'drop', dt);
    // در حین کشیدن، UI همان نسخه‌ی محلی را نشان می‌دهد (optimistic)
    expect(boardOrder(container)).toEqual(localDragged);

    // ۶۵۰ms بعد PUT می‌رود → ۴۰۹ می‌گیرد → GET تازه → نسخه‌ی دستگاه دیگر اعمال می‌شود
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    // روی صفحه فقط ویجت‌های «قابل‌نمایش» رندر می‌شوند — مخفیِ سرور (trend) در boardOrder نمی‌آید
    const serverVisible = otherSession.order.filter((id) => !otherSession.hidden.includes(id));
    await waitFor(() => expect(boardOrder(container)).toEqual(serverVisible), { timeout: 3000 });
    // اثر محلی پاک شده: نه چیدمان Local نه مخفی‌های محلی — دقیقاً نسخه‌ی سرور
    expect(boardOrder(container)).not.toEqual(localDragged);
    expect(boardOrder(container)).not.toContain('trend'); // مخفیِ سرور هم اعمال شده
    expect(boardOrder(container)).toHaveLength(DEFAULT_ORDER.length - 1);

    // localStorage هم با نسخه‌ی سرور به‌روز شده (ماندگاری پس از رفرش)
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as { order: string[]; hidden: string[] };
    expect(stored.order).toEqual(otherSession.order);
    expect(stored.hidden).toEqual(['trend']);

    // اعلام صفحه‌خوان + نشان «آخرین همگام‌سازی» با updated_at (زمانِ دستگاه دیگر) دیده می‌شود
    expect(screen.getByText('چیدمان روی دستگاه دیگری تغییر کرده بود — نسخه‌ی تازه اعمال شد.')).toBeTruthy();
    expect(screen.getByTestId('last-synced').textContent).toMatch(/آخرین همگام‌سازی:/);

    // بعد از کاهش تداخت، PUT جدیدی شلیک نشده — فقط همان یک PUT که ۴۰۹ خورد
    await act(async () => { /* flush ریزتسک‌های مانده */ });
    expect(layoutPutCalls().length).toBe(1);
  });

  it('درگ‌های پشت‌سرهم با یک PUT جمع می‌شوند (debounce) و پس از موفقیت «آخرین همگام‌سازی» نشان داده می‌شود', async () => {
    const u = userEvent.setup();
    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();

    await u.click(customizeBtn());

    // ── درگ ۱: stats بعد از progress — تایمر debounce (۶۵۰ms) برنامه‌ریزی می‌شود
    const dt1 = createDataTransfer();
    const stats = widgetEl(container, 'stats');
    const pTarget = widgetEl(container, 'progress');
    fireDrag(stats, 'dragstart', dt1);
    fireDrag(pTarget, 'dragover', dt1);
    fireDrag(pTarget, 'drop', dt1);

    // ── درگ ۲ بلافاصله: actions کنار backup — تایمر قبلی ریست و چیدمان نهایی سدانده می‌شود
    const dt2 = createDataTransfer();
    const actions = widgetEl(container, 'actions');
    const bTarget = widgetEl(container, 'backup');
    fireDrag(actions, 'dragstart', dt2);
    fireDrag(bTarget, 'dragover', dt2);
    fireDrag(bTarget, 'drop', dt2);

    // بعد از پایان سکوت debounce، «یک» PUT با چیدمانِ نهایی (هر دو درگ روی هم) می‌رود —
    // دوتا PUT یا صفرِ که بعداً اصلاح شود، هر دو اینجا شکست می‌خورند
    const finalOrder = boardOrder(container);
    expect(finalOrder).not.toEqual([...DEFAULT_ORDER]);
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    const body = JSON.parse(String(layoutPutCalls()[0][1]?.body)) as { order: string[]; hidden: string[] };
    expect(body.order).toEqual(finalOrder); // نه چیدمان تک‌درگِ اول — چیدمانِ سدانده‌شده‌ی نهایی
    expect(body.hidden).toEqual([]);

    // پس از ذخیره‌ی موفق: وضعیت synced + نشان «آخرین همگام‌سازی: HH:MM:SS» next to نشان‌گر
    await waitInitialSync();
    const last = screen.getByTestId('last-synced');
    expect(last.textContent).toMatch(/آخرین همگام‌سازی:/);
    expect(last.textContent).toMatch(/[\d\u06F0-\u06F9]/); // ساعت با رقم (فارسی/لاتین)
    // زمانِ همان ذخیره در localStorage هم می‌ماند — صفحات بکاپ/لاگ/گزارش از همین‌جا می‌خوانند
    const persisted = readLastSynced(LAYOUT_KEY);
    expect(persisted).toBeTruthy();
    expect(Number.isNaN(new Date(String(persisted)).getTime())).toBe(false);
    // تا وقتی save موفقِ تازه‌ای نباشد، دوباره نمایان نمی‌شود — show-after-success
    expect(screen.queryByText(/در حال ذخیره روی سرور/)).toBeNull();

    // ── نشان قابل‌کلیک: پیش از کلیک جزئیات بسته است؛ کلیک، تاریخ کامل (شمسی + میلادی) باز می‌کند
    expect(last.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('last-synced-detail')).toBeNull();
    await u.click(last);
    const full = screen.getByTestId('last-synced-detail');
    expect(last.getAttribute('aria-expanded')).toBe('true');
    // تاریخ شمسی با نام ماه («۲۶ مهر ۱۴۰۵») + ساعت + برابر میلادی با رقم لاتین
    expect(full.textContent).toMatch(new RegExp(JALALI_MONTHS.join('|')));
    expect(full.textContent).toMatch(/میلادی:/);
    expect(full.textContent).toMatch(/[0-9]/); // نمایش میلادی با رقم لاتین (nu-latn)
    // کلیک دوباره جمع می‌کند — toggle واقعی است، نه حالتِ بازِ گیرکرده
    await u.click(last);
    expect(last.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('last-synced-detail')).toBeNull();
  });

  it('تاریخچه‌ی PUTها: hover میانی PUT اضافه نمی‌سازد و هر ذخیره‌ی بعدی base_updated_at تازه‌شده می‌فرستد', async () => {
    const u = userEvent.setup();
    // سرور اجرا واقعی: برای هر PUT یک updated_at تازه برمی‌گرداند تا زنجیره‌ی
    // «پایه‌ی تداخل» بین دو جلسه‌ی ذخیره پیگیری شود — اول ذخیره ۱، بعد ۲
    const savedTimes = ['2026-10-18T08:00:01.000Z', '2026-10-18T08:05:02.000Z'];
    let putCount = 0;
    overrideRoute('PUT', /^\/dashboard\/layout$/, () => {
      const updated_at = savedTimes[Math.min(putCount++, savedTimes.length - 1)];
      return { ok: true, updated_at };
    });

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    await u.click(customizeBtn());

    // ── جلسه‌ی ذخیره‌ی ۱: درگ stats بعد از progress با عبور hover از «trend» و «progress»
    // (hover میانی فقط هایلایت می‌سازد — نباید هیچ PUT ای بسازد)
    const dt1 = createDataTransfer();
    const stats = widgetEl(container, 'stats');
    const trend = widgetEl(container, 'trend');
    const progress = widgetEl(container, 'progress');
    fireDrag(stats, 'dragstart', dt1);
    fireDrag(trend, 'dragover', dt1);
    fireDrag(progress, 'dragover', dt1);
    fireDrag(progress, 'drop', dt1);

    // کل جلسه (dragstart + دو hover + drop) دقیقاً یک PUT بعد از سکوت debounce —
    // اگر hover خودش commit می‌کرد، اینجا ۲ یا ۳ تا PUT می‌دیدیم
    const order1 = boardOrder(container);
    expect(order1).not.toEqual([...DEFAULT_ORDER]);
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    const body1 = JSON.parse(String(layoutPutCalls()[0][1]?.body)) as {
      order: string[]; hidden: string[]; base_updated_at?: string;
    };
    expect(body1.order).toEqual(order1);
    expect(body1.hidden).toEqual([]);
    // اولین ذخیره پایه‌ی تداخل ندارد — هنگام آغاز، ردیفی روی سرور نبود (چیدمان فقط محلی)
    expect(body1.base_updated_at).toBeUndefined();

    // صبر تا state تازه‌ی serverUpdatedAt از ذخیره‌ی ۱ جا بیفتد (نشانگر saving جمع شد)
    await waitInitialSync();

    // ── جلسه‌ی ذخیره‌ی ۲: درگ actions کنار backup — باید با پایه‌ی تازه (updated_at ذخیره‌ی ۱) برود
    const dt2 = createDataTransfer();
    const actions = widgetEl(container, 'actions');
    const backup = widgetEl(container, 'backup');
    fireDrag(actions, 'dragstart', dt2);
    fireDrag(backup, 'dragover', dt2);
    fireDrag(backup, 'drop', dt2);

    const order2 = boardOrder(container);
    expect(order2).not.toEqual(order1);
    await waitFor(() => expect(layoutPutCalls().length).toBe(2), { timeout: 3000 });
    const body2 = JSON.parse(String(layoutPutCalls()[1][1]?.body)) as {
      order: string[]; hidden: string[]; base_updated_at?: string;
    };
    // زنجیره‌ی پایه: ذخیره‌ی ۲ دقیقاً از updated_at ذخیره‌ی ۱ استفاده کرده —
    // یعنی اگر دستگاه دیگری وسط نوشته بود، سرور می‌توانست ۴۰۹ درست بدهد
    expect(body2.base_updated_at).toBe(savedTimes[0]);
    expect(body2.order).toEqual(order2); // چیدمان نهاییِ هر دو درگ روی هم در PUT دوم
    expect(body2.hidden).toEqual([]);
  });

  it('گزارش PUTهای ناموفق: شمارش فارسی + کلیک → دلیل/ساعت هر مورد (شبکه و ۴۰۹)', async () => {
    const u = userEvent.setup();
    // PUT اول خطای سرور (۵۰۰ → شاخه‌ی شبکه)، PUT دوم ردِ تداخل (۴۰۹ → شاخه‌ی conflict)
    let puts = 0;
    overrideRoute('PUT', /^\/dashboard\/layout$/, () => {
      puts += 1;
      return puts === 1
        ? { __status: 500, error: 'خطای سرور' }
        : { __status: 409, error: 'چیدمان توسط نشست دیگری تغییر کرده است' };
    });
    // خواندنِ بعد از ۴۰۹ چیزی ندارد → فقط گزارش ثبت می‌شود، نسخه‌ای اعمال نمی‌شود
    overrideRoute('GET', /^\/dashboard\/layout$/, () => ({}));

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    await u.click(customizeBtn());

    // ── درگ ۱ → PUT اول (شکست شبکه/سرور) → نشان گزارش با شمارش «۱»
    const dt1 = createDataTransfer();
    fireDrag(widgetEl(container, 'stats'), 'dragstart', dt1);
    const p1 = widgetEl(container, 'progress');
    fireDrag(p1, 'dragover', dt1);
    fireDrag(p1, 'drop', dt1);
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByTestId('failed-puts').textContent).toContain('۱ ذخیره ناموفق');
    });
    // هنوز جزئیات بسته است
    expect(screen.getByTestId('failed-puts').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('failed-puts-detail')).toBeNull();

    // ── درگ ۲ → PUT دوم (تداخل ۴۰۹) → شمارش «۲»
    const dt2 = createDataTransfer();
    fireDrag(widgetEl(container, 'actions'), 'dragstart', dt2);
    const b2 = widgetEl(container, 'backup');
    fireDrag(b2, 'dragover', dt2);
    fireDrag(b2, 'drop', dt2);
    await waitFor(() => expect(layoutPutCalls().length).toBe(2), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByTestId('failed-puts').textContent).toContain('۲ ذخیره ناموفق');
    });

    // ── کلیک → جزئیات: هر دو دلیل + ساعت هر مورد (به‌ترتیب قدیمی → جدید)
    await u.click(screen.getByTestId('failed-puts'));
    expect(screen.getByTestId('failed-puts').getAttribute('aria-expanded')).toBe('true');
    const detail = screen.getByTestId('failed-puts-detail');
    expect(detail.textContent).toContain('شبکه/سرور');
    expect(detail.textContent).toContain('تداخل ۴۰۹');
    expect(detail.textContent).toMatch(/[\d\u06F0-\u06F9]/); // ساعت هر مورد
    const lines = detail.textContent!.split('تداخل ۴۰۹');
    expect(lines.length).toBe(2); // دقیقاً یک مورد تداخل ۴۰۹ ثبت شده

    // ── کلیک دوباره جمع می‌کند (toggle واقعی)
    await u.click(screen.getByTestId('failed-puts'));
    expect(screen.getByTestId('failed-puts').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('failed-puts-detail')).toBeNull();
  });

  it('صفِ آفلاین: شمارش تغییرهای ثبت‌نشده + با رویداد online همه در یک PUT sync می‌شوند', async () => {
    const u = userEvent.setup();
    // تا وقتی failing=true همه‌ی PUTها می‌شکنند (شبکه‌ی قطع)؛ بعد وصل می‌شویم
    let failing = true;
    overrideRoute('PUT', /^\/dashboard\/layout$/, () =>
      failing
        ? { __status: 500, error: 'شبکه قطع است' }
        : { ok: true, updated_at: '2026-10-18T09:30:00.000Z' },
    );

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    await u.click(customizeBtn());

    // ── درگ ۱ (آفلاین) → PUT شکست → نشان صف با «۱ تغییر ثبت‌نشده» + نشان آفلاین
    const dt1 = createDataTransfer();
    fireDrag(widgetEl(container, 'stats'), 'dragstart', dt1);
    const p1 = widgetEl(container, 'progress');
    fireDrag(p1, 'dragover', dt1);
    fireDrag(p1, 'drop', dt1);
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByTestId('unsynced-queue').textContent).toContain('۱ تغییر ثبت‌نشده');
    });
    expect(screen.getByText(/آفلاین/)).toBeTruthy(); // همان نشانِ آفلاین هم دیده می‌شود

    // ── درگ ۲ (هنوز آفلاین) → شکست دوم → شمارش «۲» — هر دو تغییر در صف مانده‌اند
    const dt2 = createDataTransfer();
    fireDrag(widgetEl(container, 'actions'), 'dragstart', dt2);
    const b2 = widgetEl(container, 'backup');
    fireDrag(b2, 'dragover', dt2);
    fireDrag(b2, 'drop', dt2);
    await waitFor(() => expect(layoutPutCalls().length).toBe(2), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getByTestId('unsynced-queue').textContent).toContain('۲ تغییر ثبت‌نشده');
    });

    // ── وصل شدن شبکه → رویداد online → «یک» PUT با چیدمانِ نهایی (هر دو درگ با هم)
    failing = false;
    const finalOrder = boardOrder(container);
    expect(finalOrder).not.toEqual([...DEFAULT_ORDER]);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(layoutPutCalls().length).toBe(3), { timeout: 3000 });
    const body = JSON.parse(String(layoutPutCalls()[2][1]?.body)) as { order: string[] };
    expect(body.order).toEqual(finalOrder); // نه دو PUT جدا — همه‌ی تغییرها یک‌جا

    // ── نتیجه: صف خالی، نشان آفلاین رفته، نشان «آخرین همگام‌سازی» برگشته
    await waitFor(() => {
      expect(screen.queryByTestId('unsynced-queue')).toBeNull();
      expect(screen.queryByText(/آفلاین/)).toBeNull();
      expect(screen.getByTestId('last-synced')).toBeTruthy();
    });
    // PUT چهارمی در کار نیست — فقط همان یک ارسالِ یک‌جا
    await act(async () => { /* flush ریزتسک‌های مانده */ });
    expect(layoutPutCalls().length).toBe(3);
  });

  it('نشان وضعیت آفلاین: قابل‌کلیک → جزئیات (توضیح + شمارش صف) با باز/بسته‌ی واقعی', async () => {
    const u = userEvent.setup();
    overrideRoute('PUT', /^\/dashboard\/layout$/, () => ({ __status: 500, error: 'شبکه قطع است' }));

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    await u.click(customizeBtn());

    const dt = createDataTransfer();
    fireDrag(widgetEl(container, 'stats'), 'dragstart', dt);
    const p = widgetEl(container, 'progress');
    fireDrag(p, 'dragover', dt);
    fireDrag(p, 'drop', dt);
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });

    // نشان آفلاین یک دکمه است — پیش از کلیک جزئیات بسته و aria-expanded=false
    const badge = await screen.findByTestId('sync-status');
    expect(badge.tagName).toBe('BUTTON');
    expect(badge.textContent).toMatch(/آفلاین/);
    expect(badge.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('sync-status-detail')).toBeNull();

    // کلیک → جزئیات: توضیح رفتار آفلاین + شمارش صف (۱ تغییر معلق)
    await u.click(badge);
    const detail = screen.getByTestId('sync-status-detail');
    expect(screen.getByTestId('sync-status').getAttribute('aria-expanded')).toBe('true');
    expect(detail.textContent).toMatch(/وصل شدن شبکه/);
    expect(detail.textContent).toMatch(/۱ تغییر در صف/);

    // کلیک دوم → toggle واقعی، جزئیات جمع می‌شود (نشان ایستا نمانده)
    await u.click(screen.getByTestId('sync-status'));
    expect(screen.queryByTestId('sync-status-detail')).toBeNull();
  });

  it('نشان وضعیت «در حال ذخیره»: قابل‌کلیک → جزئیات ارسالِ در حینِ پاسخ معلق', async () => {
    const u = userEvent.setup();
    // پاسخ PUT عمداً ۴۰۰ms معطل می‌ماند تا وضعیت میانی «در حال ذخیره»
    // (بین فرستادن درخواست و رسیدن پاسخ) قابل‌ریپلیکا و قابل‌کلیک شود
    overrideRoute('PUT', /^\/dashboard\/layout$/, () => ({
      __delay: 400,
      ok: true,
      updated_at: '2026-10-18T09:40:00.000Z',
    }));

    const { container } = await renderReadyDashboard();
    await waitInitialSync();
    resetFetchCalls();
    await u.click(customizeBtn());

    const dt = createDataTransfer();
    fireDrag(widgetEl(container, 'stats'), 'dragstart', dt);
    const p = widgetEl(container, 'progress');
    fireDrag(p, 'dragover', dt);
    fireDrag(p, 'drop', dt);

    // PUT رفت اما پاسخ (با تأخیر مصنوعی) هنوز نرسیده → نشان «در حال ذخیره»
    await waitFor(() => expect(layoutPutCalls().length).toBe(1), { timeout: 3000 });
    const badge = await screen.findByTestId('sync-status');
    expect(badge.tagName).toBe('BUTTON');
    expect(badge.textContent).toMatch(/در حال ذخیره/);
    expect(badge.getAttribute('aria-expanded')).toBe('false');

    // کلیک در حین ارسال → جزئیات وضعیت باز می‌شود
    await u.click(badge);
    const detail = screen.getByTestId('sync-status-detail');
    expect(detail.textContent).toMatch(/ارسال تغییرات چیدمان به سرور/);
    expect(screen.getByTestId('sync-status').getAttribute('aria-expanded')).toBe('true');

    // پاسخ می‌رسد → نشان وضعیت جمع می‌شود و زنجیره به «آخرین همگام‌سازی» برمی‌گردد
    await waitFor(() => expect(screen.queryByTestId('sync-status')).toBeNull(), { timeout: 3000 });
    await waitInitialSync();
    expect(screen.getByTestId('last-synced')).toBeTruthy();
  });
});
