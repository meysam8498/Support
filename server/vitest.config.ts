// ============================================================
// تنظیمات vitest — تست‌های سرور
// از ریشه اجرا می‌شود: npm test -w server
// هر فایل تست با DB_PATH خودش سرور/لایه‌ی DB را ایزوله می‌کند.
// ============================================================
import path from 'node:path';

export default {
  root: import.meta.dirname,
  include: ['tests/**/*.test.ts'],
  environment: 'node',
  testTimeout: 60_000,
  // هر فایل سرور موقت خودش را بالا می‌آورد — سریالی تا پورت‌ها تداخل نکنند
  fileParallelism: false,
  sequence: { concurrent: false },
  pool: 'forks',
  poolOptions: { forks: { singleFork: true } },
};
