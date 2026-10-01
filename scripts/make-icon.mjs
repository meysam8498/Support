#!/usr/bin/env node
// ============================================================
// make-icon — ساخت icon.png گرادیان ایندیگو با «T» سفید (RTL)
// خروجی: desktop/src-tauri/app-icon.png (1024×1024) — بدون وابستگی
// سپس «npx tauri icon» از آن icons/icon.ico و بقیه را می‌سازد.
// ============================================================
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'desktop', 'src-tauri', 'app-icon.png');
const S = 1024;

const px = new Uint8Array(S * S * 4);
function put(x, y, r, g, b) {
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
}
function roundRect(x0, y0, x1, y1, rad, r, g, b) {
  for (let y = Math.max(0, y0); y < Math.min(S, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(S, x1); x++) {
      const dx = Math.max(x0 + rad - x, x - (x1 - rad), 0);
      const dy = Math.max(y0 + rad - y, y - (y1 - rad), 0);
      if (dx * dx + dy * dy <= rad * rad) put(x, y, r, g, b);
    }
  }
}

// قاب گردگوشه با گرادیان قطره‌ای ایندیگو (#4f46e5 → #6d28d9)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const t = (x + y) / (2 * S);
    const r = Math.round(0x4f + (0x6d - 0x4f) * t);
    const g = Math.round(0x46 + (0x28 - 0x46) * t);
    const b = Math.round(0xe5 + (0xd9 - 0xe5) * t);
    put(x, y, r, g, b);
  }
}
roundRect(0, 0, S, S, 180, 0, 0, 0); // شفاف بیرون قاب
// mask: بازگرداندن رنگ داخل قاب — ساده‌تر: قاب را دوباره بکش
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = Math.max(180 - x, x - (S - 180), 0);
    const dy = Math.max(180 - y, y - (S - 180), 0);
    if (dx * dx + dy * dy > 180 * 180) {
      const i = (y * S + x) * 4;
      px[i + 3] = 0;
    }
  }
}
// حرف «T» سفید — RTL: بازوی افقی بالا، ساقه‌ی عمودی وسط
function fillRect(x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, 255, 255, 255);
}
fillRect(272, 300, 752, 392); // بازوی افقی
fillRect(452, 300, 572, 760); // ساقه

// PNG encoder: IHDR + IDAT (deflate بدون فیلتر) + IEND
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(OUT, png);
console.log(`✔ آیکون ساخته شد: ${OUT} (${(png.length / 1024).toFixed(0)}KB)`);
