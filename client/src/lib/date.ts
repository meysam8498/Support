import jalaali from 'jalaali-js';

/** اعتبارسنجی تاریخ شمسی و نرمال‌سازی به YYYY/MM/DD */
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
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** شمسی → میلادی ISO */
export function jalaliToGregorian(jalali: string): string | null {
  const norm = normalizeJalali(jalali);
  if (!norm) return null;
  const [jy, jm, jd] = norm.split('/').map(Number);
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/** میلادی → شمسی */
export function gregorianToJalali(iso: string | Date): string | null {
  let gy: number, gm: number, gd: number;
  if (iso instanceof Date) {
    gy = iso.getFullYear();
    gm = iso.getMonth() + 1;
    gd = iso.getDate();
  } else {
    const m = iso.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    gy = +m[1]; gm = +m[2]; gd = +m[3];
  }
  const j = jalaali.toJalaali(gy, gm, gd);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

export function todayJalali(): string {
  return gregorianToJalali(new Date())!;
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** نمایش فارسی با نام ماه: ۱۵ مرداد ۱۴۰۳ */
export function formatJalaliLong(jalali: string | null | undefined): string {
  if (!jalali) return '—';
  const norm = normalizeJalali(jalali);
  if (!norm) return jalali;
  const [jy, jm, jd] = norm.split('/').map(Number);
  const month = JALALI_MONTHS[jm - 1] ?? '';
  return `${toFa(jd)} ${month} ${toFa(jy)}`;
}

/** اعداد انگلیسی → فارسی */
export function toFa(n: string | number | null | undefined): string {
  if (n == null) return '—';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

/** حذف صفرهای اضافی سمت چپ (مثلاً 1403/05/01 → 1403/5/1) برای نمایش سبک‌تر */
export function stripLeadingZeros(jalali: string | null): string {
  if (!jalali) return '';
  return jalali.replace(/\/0+/g, '/');
}

/**
 * افزودن چند ماه به تاریخ شمسی و برگرداندن تاریخ نرمال‌شده‌ی YYYY/MM/DD.
 * اگر روز هدف از محدوده‌ی ماه جدید خارج شود (مثلاً 31 در یک ماه 30 روزه)،
 * به آخرین روز آن ماه clamp می‌شود.
 * در صورت ورودی نامعتبر null برمی‌گردد.
 */
export function addMonthsToJalali(jalaliInput: string | null | undefined, months: number | null | undefined): string | null {
  if (!jalaliInput || !months || months <= 0) return null;
  const norm = normalizeJalali(jalaliInput);
  if (!norm) return null;
  const [jy, jm, jd] = norm.split('/').map(Number);

  // محاسبه‌ی کل ماه‌ها و سپس تفکیک سال/ماه
  let totalMonths = jy * 12 + (jm - 1) + months;
  const newY = Math.floor(totalMonths / 12);
  const newM = totalMonths % 12 + 1; // 1..12

  // تعداد روزهای ماه جدید شمسی
  const daysInNewMonth = jalaali.jalaaliMonthLength(newY, newM);
  const newD = Math.min(jd, daysInNewMonth);

  if (!jalaali.isValidJalaaliDate(newY, newM, newD)) return null;
  return `${newY}/${String(newM).padStart(2, '0')}/${String(newD).padStart(2, '0')}`;
}