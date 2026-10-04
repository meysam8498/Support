// ============================================================
// منبع واحد رشته‌های مشترک سرور — خواندن shared/app-strings.json ریشه‌ی پروژه
// طراح و توسعه‌دهنده: میثم ایجادی / M.Ijadi@Hotmail.com
// کلاینت همین فایل را مستقیم در vite import می‌کند؛ سرور در اجرا (src و dist
// هر دو سه پوشه زیر ریشه‌اند) با readFileSync می‌خواند تا بیلد tsc درگیر نشود.
// اگر فایل نبود (استقرار ناقص)، با مقادیر fallback بالا می‌آید — نه کرش.
// ============================================================
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SharedStrings {
  credentials: {
    minUsername: number;
    minPassword: number;
    msgUsernameShort: string;
    msgPasswordShort: string;
  };
  license: {
    upgrade402: string;
  };
}

/** مقادیر fallback — فقط اگر shared/app-strings.json در دسترس نبود (هرگز نباید در حالت عادی مصرف شود) */
const FALLBACK: SharedStrings = {
  credentials: {
    minUsername: 2,
    minPassword: 4,
    msgUsernameShort: 'نام کاربری حداقل ۲ نویسه است.',
    msgPasswordShort: 'رمز عبور حداقل ۴ نویسه است.',
  },
  license: {
    upgrade402: 'سقف نسخه‌ی آزمایشی پر شده است — برای ادامه، سامانه را ارتقا دهید.',
  },
};

// server/src/lib و server/dist/lib هر دو سه سطح زیر ریشه‌ی پروژه‌اند
const SHARED_FILE = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'app-strings.json',
);

function loadSharedStrings(): SharedStrings {
  try {
    const parsed = JSON.parse(readFileSync(SHARED_FILE, 'utf8')) as Partial<SharedStrings>;
    return {
      credentials: { ...FALLBACK.credentials, ...parsed.credentials },
      license: { ...FALLBACK.license, ...parsed.license },
    };
  } catch {
    console.warn(`⚠ shared/app-strings.json خوانده نشد (${SHARED_FILE}) — از مقادیر fallback استفاده می‌شود.`);
    return FALLBACK;
  }
}

export const SHARED_STRINGS: SharedStrings = loadSharedStrings();
