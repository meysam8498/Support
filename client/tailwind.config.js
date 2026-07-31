/**
 * پیکربندی Tailwind CSS
 * طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
 * حالت تم: مبتنی بر کلاس (darkMode: 'class') تا بتوان بین دارک/لات سوییچ کرد.
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
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcd9ff',
          300: '#8ec1ff',
          400: '#599dff',
          500: '#3377f6',
          600: '#1f59db',
          700: '#1a46b0',
          800: '#1b3d8c',
          900: '#1c3671',
        },
      },
    },
  },
  plugins: [],
};
