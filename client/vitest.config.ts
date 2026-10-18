// ============================================================
// پیکربندی Vitest برای تست‌های کلاینت (دسترس‌پذیری/a11y)
// ------------------------------------------------------------
// • بدون پلاگین react — تبدیل JSX با esbuild خود Vite و با تنظیم tsconfig (jsx: react-jsx)
// • محیط jsdom: رندر واقعی کامپوننت‌ها + axe-core روی همان DOM
// • CSS لود نمی‌شود (کلاس‌های tailwind فقط نام دارند؛ قوانین رنگی در مرورگر زنده سنجیده می‌شوند)
// ============================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 30_000,
    // اجرای موازی فایل‌ها مشکلی ایجاد نمی‌کند: هر فایل DOM/localStorage خودش را دارد
  },
});
