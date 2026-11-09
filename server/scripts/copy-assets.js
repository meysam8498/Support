/**
 * کپی فایل‌های غیر-TS (مثل schema.sql) از src به dist پس از tsc.
 * node:sqlite و سایر کدها در runtime به این فایل‌ها نیاز دارند.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** فایل‌های (src → dist) که باید کپی شوند. */
const assets = [
  ['src/db/schema.sql', 'dist/db/schema.sql'],
  // کلید عمومی: پس از چرخش کلید، نسخه‌ی ریشه (keys/license_public.pem) منبع حقیقت است.
  // اگر نبود (مثل CI بدون پوشه‌ی keys) نسخه‌ی کامیت‌شده‌ی src استفاده می‌شود —
  // همین باعث شده بود کلید بسته‌بندی‌شده از کلید جاری عقب بماند و کدهای نو تأیید نشوند.
  [existsSync(join(root, '..', 'keys', 'license_public.pem')) ? '../keys/license_public.pem' : 'src/lib/license_public_key.pem', 'dist/lib/license_public_key.pem'],
];

let copied = 0;
for (const [from, to] of assets) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.warn(`⚠ مبدأ وجود ندارد: ${from}`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`✓ کپی شد: ${from} → ${to}`);
  copied++;
}
console.log(`انجام شد؛ ${copied} فایل کپی شد.`);
