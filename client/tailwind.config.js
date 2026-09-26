/**
 * پیکربندی Tailwind CSS — سیستم طراحی Flip7 (تیل/مرجانی/طلایی)
 * طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
 * حالت تم: مبتنی بر کلاس (darkMode: 'class') تا بتوان بین دارک/لات سوییچ کرد.
 *
 * پالت از سیستم طراحی Flip7 اقتباس شده و برای RTL فارسی تنظیم شده است:
 *   • teal   → رنگ اصلی برند (پس‌زمینه، آواتار، نوار پیشرفت)
 *   • gold   → CTAها، هایلایت‌ها، جشن‌ها
 *   • coral  → هشدار، BOOM، انرژی
 *   • cream  → سطوح ورودی و کارت‌ها
 *   • sky    → حالت‌های اطلاع‌رسانی
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      colors: {
        // رنگ اصلی برند — تیل ( جایگزین آبی قبلی؛ همه‌ی کلاس‌های brand-* حفظ شدند )
        brand: {
          50: '#E8F6F5',
          100: '#CDEFEB',
          200: '#9FE2DE',
          300: '#6DD3CD',
          400: '#3CC4BD',
          500: '#2BA8A2',
          600: '#23968F',
          700: '#1E8C86',
          800: '#17706B',
          900: '#115650',
          950: '#0B3B37',
        },
        // طلایی — CTA و هایلایت
        gold: {
          light: '#FFE47A',
          DEFAULT: '#FFD23F',
          dark: '#E6B800',
        },
        // مرجانی — هشدار/BOOM
        coral: {
          light: '#FF8A6A',
          DEFAULT: '#EF6C4A',
          dark: '#D45233',
        },
        // کرم — سطوح ورودی/کارت
        cream: '#FFF8E7',
        // آبی آسمانی — حالت اطلاع‌رسانی
        sky: {
          light: '#85C6EC',
          DEFAULT: '#5DADE2',
          dark: '#3E93C9',
        },
        // سطوح
        surface: {
          base: '#EFF8F7',
          card: '#FFFFFF',
        },
        success: '#27AE60',
        error: '#E74C3C',
      },
      // سایه‌های glow رنگی — به‌جای سایه‌ی مشکی ساده
      boxShadow: {
        sm: '0 1px 4px rgba(0,0,0,0.08)',
        DEFAULT: '0 2px 8px rgba(0,0,0,0.10)',
        md: '0 2px 9px rgba(0,0,0,0.12)',
        lg: '0 4px 16px rgba(0,0,0,0.16)',
        'card': '0 2px 10px rgba(43,168,162,0.10)',
        'teal-glow': '0 2px 10px rgba(43,168,162,0.30)',
        'coral-glow': '0 2px 10px rgba(239,108,74,0.35)',
        'accent-glow': '0 2px 10px rgba(255,210,63,0.40)',
        'sky-glow': '0 2px 8px rgba(93,173,226,0.30)',
        'focus': '0 0 0 2px rgba(43,168,162,0.15)',
      },
      borderRadius: {
        // واحدهای گرد بازی‌گونه
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      keyframes: {
        // نبض glow برای کارت‌های خاص (winner-like)
        'glow-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.75', transform: 'scale(1.015)' },
        },
        // لرزش ظریف برای لوگو/جشن
        'crown-bounce': {
          '0%, 100%': { transform: 'rotate(-3deg) translateY(0)' },
          '50%': { transform: 'rotate(-1deg) translateY(-3px)' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'crown-bounce': 'crown-bounce 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
