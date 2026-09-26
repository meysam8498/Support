/**
 * پیکربندی Tailwind CSS — سیستم طراحی Ember Studio (تراکوتا/کهربا/استون گرم)
 * طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
 * حالت تم: مبتنی بر کلاس (darkMode: 'class') تا بتوان بین دارک/لات سوییچ کرد.
 *
 * پالت Ember Studio: گرم، مینیمال، متمرکز بر کَرافت
 *   • terracotta (#C2410C) → فقط عناصر تعاملی و وضعیت فعال
 *   • amber (#F59E0B) → اعلان‌ها، نشان‌ها، هایلایت
 *   • stone گرم → متن‌های بی‌طرف، سطوح، حاشیه‌ها
 * هرگز سفید/مشکی خالص — همیشه مقادیر پالت گرم.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // سِری/سَنس کنتراست — امضای طراحی Ember Studio
        // برای فارسی، Vazirmatn جایگزین Source Sans 3 می‌ماند؛
        // Playfair Display برای اعداد/لاتین نمایشی بارگذاری می‌شود.
        sans: ['"Source Sans 3"', 'Vazirmatn', 'Tahoma', 'sans-serif'],
        display: ['"Playfair Display"', 'Vazirmatn', 'serif'],
        mono: ['"Fira Code"', 'monospace'],
      },
      colors: {
        // رنگ اصلی برند — تراکوتا (جایگزین تیل قبلی؛ کلاس‌های brand-* حفظ شدند)
        brand: {
          50: '#FEF3EC',
          100: '#FCE4D4',
          200: '#F9C6A8',
          300: '#F0A178',
          400: '#E2754A',
          500: '#C2410C', // Primary Terracotta
          600: '#A93A0C',
          700: '#9A3412', // Primary Hover — Burnt Sienna
          800: '#7C2D0E',
          900: '#5C230B',
          950: '#3D1707',
        },
        // کهربایی — اعلان‌ها و نشان‌ها (بجای gold قبلی)
        gold: {
          light: '#FCD34D',
          DEFAULT: '#F59E0B',
          dark: '#D97706',
        },
        // مرجانی گرم — خطا/مخرب (بجای coral قبلی)
        coral: {
          light: '#F87171',
          DEFAULT: '#DC2626',
          dark: '#B91C1C',
        },
        // کرم گرم — سطوح ورودی (بجای cream قبلی)
        cream: '#FAFAF9',
        // آبی خنثیِ گرم — حالت اطلاع‌رسانی (بجای sky قبلی)
        sky: {
          light: '#93B4C8',
          DEFAULT: '#5B7E93',
          dark: '#426376',
        },
        // سطوح گرم Ember Studio
        surface: {
          base: '#FAFAF9',   // پس‌زمینه‌ی صفحه
          card: '#F5F5F4',   // کارت‌ها و پنل‌ها
          raised: '#E7E5E4', // hover/انتخاب
        },
        stone: {
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
        },
        success: '#16A34A',
        error: '#DC2626',
      },
      // ارتقاع Ember Studio — سایه‌های نرم و گرم
      boxShadow: {
        sm: '0 1px 2px rgba(28,25,23,0.04)',
        DEFAULT: '0 1px 3px rgba(28,25,23,0.06)',
        md: '0 4px 16px rgba(28,25,23,0.06)',
        lg: '0 24px 48px rgba(28,25,23,0.12)',
        'card': '0 1px 3px rgba(28,25,23,0.05)',
        'glow': '0 4px 12px rgba(194,65,12,0.25)',
        'focus': '0 0 0 3px rgba(194,65,12,0.12)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
        full: '9999px',
      },
      keyframes: {
        // انیمیشن پرشدن نوار پیشرفت
        'progress-fill': {
          from: { width: '0%' },
          to: { width: 'var(--progress-w, 100%)' },
        },
      },
      animation: {
        'progress-fill': 'progress-fill 300ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
