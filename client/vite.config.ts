import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // چانک‌بندی دستی — بهینه‌سازی کش بلندمدت سمت کلاینت:
        //   • vendor → react/react-dom/react-router — با هر deploy کد عوض نمی‌شود
        //   • api    → لایه‌ی API — فقط با تغییر خودش از نو دانلود می‌شود
        //   • index  → کد صفحات/کامپوننت‌ها (پرحجم‌ترین و متغیرترین بخش)
        manualChunks(id: string) {
          const p = id.replace(/\\/g, '/');
          if (p.includes('/src/api/')) return 'api';
          if (
            p.includes('/node_modules/react-dom/') ||
            p.includes('/node_modules/react/') ||
            p.includes('/node_modules/react-router') ||
            p.includes('/node_modules/@remix-run/') ||
            p.includes('/node_modules/scheduler/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
});
