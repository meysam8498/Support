// تنظیمات اپ — آدرس سرور از AsyncStorage خوانده می‌شود (صفحه‌ی لاگین قابل ویرایش)
// پیش‌فرض‌ها: شبیه‌ساز اندروید 10.0.2.2 (لوکال‌هاست میزبان)؛ روی دستگاه واقعی IP سیستم را بدهید.
export const DEFAULT_SERVER_URL = 'http://10.0.2.2:4000';
export const STORAGE_KEYS = {
  serverUrl: '@support/serverUrl',
  token: '@support/token',
  user: '@support/user',
  queue: '@support/queue',
} as const;
