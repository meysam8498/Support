// ============================================================
// تبدیل و یکپارچه‌سازی تاریخ شمسی ↔ میلادی
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// همه‌ی تاریخ‌ها هم به‌صورت شمسی (متنی: YYYY/MM/DD) و هم میلادی (ISO) ذخیره می‌شوند.
// ============================================================
import jalaali from 'jalaali-js';

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

/** اعتبارسنجی و نرمال‌سازی یک رشته‌ی شمسی به فرمت YYYY/MM/DD */
export function normalizeJalali(input: string): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[۰-۹]/g, (d) =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  );
  const m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
  return `${String(jy).padStart(4, '0')}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** تبدیل شمسی → میلادی (خروجی ISO YYYY-MM-DD یا null) */
export function jalaliToGregorianISO(jalali: string): string | null {
  const norm = normalizeJalali(jalali);
  if (!norm) return null;
  const [jy, jm, jd] = norm.split('/').map(Number);
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/** تبدیل میلادی (ISO YYYY-MM-DD یا Date) → شمسی YYYY/MM/DD یا null */
export function gregorianToJalali(gregorian: string | Date): string | null {
  let gy: number, gm: number, gd: number;
  if (gregorian instanceof Date) {
    gy = gregorian.getFullYear();
    gm = gregorian.getMonth() + 1;
    gd = gregorian.getDate();
  } else {
    if (!gregorian) return null;
    const m = gregorian.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    gy = Number(m[1]);
    gm = Number(m[2]);
    gd = Number(m[3]);
  }
  const j = jalaali.toJalaali(gy, gm, gd);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** امروز به شمسی */
export function todayJalali(): string {
  return gregorianToJalali(new Date())!;
}

/** امروز به میلادی ISO */
export function todayGregorian(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** یک جفت تاریخ کامل از یک ورودی شمسی (هم شمسی نرمال‌شده هم میلادی) */
export function datePairFromJalali(jalaliInput: string): { jalali: string | null; gregorian: string | null } {
  const jalali = normalizeJalali(jalaliInput);
  if (!jalali) return { jalali: null, gregorian: null };
  return { jalali, gregorian: jalaliToGregorianISO(jalali) };
}

/**
 * افزودن چند ماه به یک تاریخ شمسی (برای محاسبه‌ی پایان گارانتی).
 * اگر روزِ مقصد از طول ماه مقصد بیشتر بود، به آخرین روز آن ماه برش می‌خورد
 * (مثلاً ۱۴۰۳/۱۲/۳۰ + ۱ ماه → ۱۴۰۳/۱۲/۳۰ در اسفند ۳۰ روزه است، پس نرمال می‌شود).
 * خروجی: YYYY/MM/DD شمسی یا null اگر ورودی نامعتبر باشد.
 */
export function addMonthsToJalali(jalaliInput: string, months: number): string | null {
  const norm = normalizeJalali(jalaliInput);
  if (!norm || !Number.isFinite(months)) return null;
  const [jy, jm, jd] = norm.split('/').map(Number);
  // تبدیل به یک شماره‌ی کلی ماه، جمع، سپس بازگشت به سال/ماه
  const totalMonths = jy * 12 + (jm - 1) + Math.trunc(months);
  const newY = Math.floor(totalMonths / 12);
  const newM = ((totalMonths % 12) + 12) % 12 + 1;
  const monthLength = jalaali.jalaaliMonthLength(newY, newM);
  const newD = Math.min(jd, monthLength);
  if (!jalaali.isValidJalaaliDate(newY, newM, newD)) return null;
  return `${String(newY).padStart(4, '0')}/${String(newM).padStart(2, '0')}/${String(newD).padStart(2, '0')}`;
}

/**
 * محاسبه‌ی کامل جفتِ «پایان گارانتی» از شروع + مدت (ماه).
 * خروجی شامل هر دو فرمت شمسی و میلادی است (یا هر دو null اگر ورودی ناقص باشد).
 */
export function warrantyEndPair(
  startJalali: string | null | undefined,
  months: number | null | undefined
): { jalali: string | null; gregorian: string | null } {
  if (!startJalali || !months || months <= 0) return { jalali: null, gregorian: null };
  const endJalali = addMonthsToJalali(startJalali, months);
  if (!endJalali) return { jalali: null, gregorian: null };
  return { jalali: endJalali, gregorian: jalaliToGregorianISO(endJalali) };
}

/** نام ماه‌های شمسی */
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** قالب‌بندی نمایش تاریخ شمسی با نام ماه (مثلاً: ۱۴۰۳ مرداد ۱۵) */
export function formatJalaliLong(jalali: string | null | undefined): string {
  if (!jalali) return '—';
  const norm = normalizeJalali(jalali);
  if (!norm) return jalali;
  const [jy, jm, jd] = norm.split('/').map(Number);
  const monthName = JALALI_MONTHS[jm - 1] ?? jm;
  const toFa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  return `${toFa(jd)} ${monthName} ${toFa(jy)}`;
}

/** تبدیل اعداد انگلیسی به فارسی برای نمایش */
export function toFaDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '—';
  return String(input).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
