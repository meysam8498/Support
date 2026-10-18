// ============================================================
// آماده‌سازی محیط jsdom برای تست‌های کلاینت (a11y)
// ------------------------------------------------------------
// • matchMedia: jsdom پیاده‌سازی ندارد — نسخه‌ی ساده‌شده (بدون تغییر رسانه)
// • scrollIntoView / ResizeObserver: در jsdom نیستند؛ stub بی‌اثر
// • fetch: کل شبکه با apiMock (fixtures) جایگزین می‌شود — تست‌ها آفلاین و قطعی‌اند
// ============================================================
import { installApiMock } from './apiMock';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => { /* noop */ },
    removeEventListener: () => { /* noop */ },
    addListener: () => { /* noop */ },
    removeListener: () => { /* noop */ },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => { /* noop */ };
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
  } as unknown as typeof ResizeObserver;
}

installApiMock();
