/**
 * پیکربندی Tailwind CSS — سیستم طراحی PipelinePro (ایندیگو/فیروزه‌ای/نارنجی)
 * طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
 * مرجع زبان طراحی: DESIGN.md (استاندارد google-labs-code/design.md)
 * حالت تم: مبتنی بر کلاس (darkMode: 'class')
 *
 * پالت PipelinePro: ساختارمند، داده‌محور، مطمئن
 *   • indigo (#4F46E5) → عناصر تعاملی، منوی فعال، CTA اصلی
 *   • cyan (#06B6D4) → لینک‌ها و هایلایت ثانویه
 *   • orange (#F97316) → فوریت: نزدیک سقف، هشدار پیش از انقضا (هرگز قرمز نه)
 *   • zinc خنثی → متن، سطوح، حاشیه‌ها؛ بستر #FAFAFA با کارت سفید
 * کلاس‌های برند قدیمی (brand/gold/coral/sky) حفظ شده‌اند تا همه‌ی صفحات
 * بدون تغییر نام کلاس، با پالت جدید رندر شوند.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // PipelinePro: Outfit نمایشی + Inter بدنه؛ فارسی: Vazirmatn
        sans: ['Inter', 'Vazirmatn', 'Tahoma', 'sans-serif'],
        display: ['Outfit', 'Vazirmatn', 'sans-serif'],
        mono: ['"Source Code Pro"', 'monospace'],
      },
      colors: {
        // ایندیگو — رنگ اصلی برند (نام کلاس brand-* حفظ شد)
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#4F46E5', // Primary — Indigo
          600: '#4338CA', // Primary Hover
          700: '#3730A3', // Primary Active
          800: '#312E81',
          900: '#1E1B4B',
          950: '#16123F',
        },
        // نارنجی فوریت — نزدیک سقف/انقضا (نام کلاس gold-* حفظ شد)
        gold: {
          light: '#FDBA74',
          DEFAULT: '#F97316',
          dark: '#EA580C',
        },
        // قرمز خطا/مخرب (نام کلاس coral-* حفظ شد)
        coral: {
          light: '#FCA5A5',
          DEFAULT: '#EF4444',
          dark: '#DC2626',
        },
        // فیروزه‌ای — لینک/هایلایت ثانویه (نام کلاس sky-* حفظ شد)
        sky: {
          light: '#67E8F9',
          DEFAULT: '#06B6D4',
          dark: '#0891B2',
        },
        cream: '#FAFAFA',
        // سطوح PipelinePro — بستر خاکستری سردِ روشن با کارت سفید
        surface: {
          base: '#FAFAFA',
          card: '#FFFFFF',
          raised: '#F4F4F5',
        },
        stone: {
          50: '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
        },
        success: '#22C55E',
        error: '#EF4444',
      },
      // ارتقاع Material-style لایه‌ای — PipelinePro
      boxShadow: {
        sm: '0 1px 2px rgba(24,24,27,0.05)',
        DEFAULT: '0 1px 3px rgba(24,24,27,0.07), 0 1px 2px rgba(24,24,27,0.05)',
        md: '0 4px 6px -1px rgba(24,24,27,0.07), 0 2px 4px -2px rgba(24,24,27,0.05)',
        lg: '0 10px 15px -3px rgba(24,24,27,0.08), 0 4px 6px -4px rgba(24,24,27,0.04)',
        card: '0 1px 2px rgba(24,24,27,0.05)',
        glow: '0 4px 12px rgba(79,70,229,0.25)',
        focus: '0 0 0 3px rgba(79,70,229,0.12)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '20px',
        '2xl': '20px',
        '3xl': '24px',
        full: '9999px',
      },
      keyframes: {
        'progress-fill': {
          from: { width: '0%' },
          to: { width: 'var(--progress-w, 100%)' },
        },
      },
      animation: {
        'progress-fill': 'progress-fill 200ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
