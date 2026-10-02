// ============================================================
// قوانین اعتبارسنجی مشترک سرور — منبع واحد قوانین اعتبارنامه‌ها
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ⚠️ همگامی: این اعداد و پیام‌ها باید با گیت UX سمت کلاینت یکی بمانند
// (client/src/pages/LoginPage.tsx — حداقل ۲ نویسه نام کاربری، ۴ نویسه رمز).
// نکته: لاگین عمداً فقط min(1) چک می‌کند (routes/auth.ts) — اعمال حداقل طول
// روی «ورود» حساب‌های قدیمی با رمز کوتاه را قفل می‌کرد؛ قانون طول اینجا فقط
// روی «ساخت/تغییر» اعتبارنامه اعمال می‌شود (ساخت کاربر، بازنشانی رمز).
// ============================================================
import { z } from 'zod';

/** حداقل طول نام کاربری — همگام با LoginPage سمت کلاینت */
export const MIN_USERNAME_LENGTH = 2;
/** حداقل طول رمز عبور — همگام با LoginPage سمت کلاینت */
export const MIN_PASSWORD_LENGTH = 4;

// پیام‌ها عیناً همان رشته‌های LoginPage هستند (با ارقام فارسی) تا کاربر
// در UI و از سرور همیشه یک پیام واحد ببیند. اگر ثابت بالا را تغییر دادید،
// این دو رشته را هم هماهنگ کنید.
export const MSG_USERNAME_SHORT = 'نام کاربری حداقل ۲ نویسه است.';
export const MSG_PASSWORD_SHORT = 'رمز عبور حداقل ۴ نویسه است.';

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
