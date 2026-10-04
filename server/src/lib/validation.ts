// ============================================================
// قوانین اعتبارسنجی مشترک سرور — منبع واحد قوانین اعتبارنامه‌ها
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// مقادیر و پیام‌ها از منبع واحد مشترک (shared/app-strings.json) می‌آیند که
// کلاینت (LoginPage/UsersPage) هم از همان می‌خواند — همگامی دستی حذف شد.
// نکته: لاگین عمداً فقط min(1) چک می‌کند (routes/auth.ts) — اعمال حداقل طول
// روی «ورود» حساب‌های قدیمی با رمز کوتاه را قفل می‌کرد؛ قانون طول اینجا فقط
// روی «ساخت/تغییر» اعتبارنامه اعمال می‌شود (ساخت کاربر، بازنشانی رمز).
// ============================================================
import { z } from 'zod';
import { SHARED_STRINGS } from './sharedStrings.js';

const C = SHARED_STRINGS.credentials;

/** حداقل طول نام کاربری — از منبع واحد مشترک با کلاینت */
export const MIN_USERNAME_LENGTH = C.minUsername;
/** حداقل طول رمز عبور — از منبع واحد مشترک با کلاینت */
export const MIN_PASSWORD_LENGTH = C.minPassword;

export const MSG_USERNAME_SHORT = C.msgUsernameShort;
export const MSG_PASSWORD_SHORT = C.msgPasswordShort;

/** نام کاربری — فاصله‌های ابتدا/انتها حذف می‌شود؛ حداقل طول همگام با کلاینت */
export const usernameSchema = z
  .string({ required_error: 'نام کاربری الزامی است.' })
  .trim()
  .min(MIN_USERNAME_LENGTH, MSG_USERNAME_SHORT);

/** رمز عبور — حداقل طول همگام با کلاینت */
export const passwordSchema = z
  .string({ required_error: 'رمز عبور الزامی است.' })
  .min(MIN_PASSWORD_LENGTH, MSG_PASSWORD_SHORT);

/** اولین پیام خطای zod (فارسی) — برای پاسخ ۴۰۰ خوانا برای کاربر */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'ورودی نامعتبر است.';
}
