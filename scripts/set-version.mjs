#!/usr/bin/env node
// ============================================================
// set-version — همگام‌سازی ورژن فایل‌های دسکتاپ (desktop/*) با ریشه
// صدا زده‌شده از scripts/bump-version.mjs — ورژن مقصد از argv[2]
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEW = process.argv[2];
if (!NEW || !/^\d+\.\d+\.\d+$/.test(NEW)) {
  console.error('استفاده: node scripts/set-version.mjs X.Y.Z');
  process.exit(1);
}

const files = [
  'desktop/package.json',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/tauri.support.conf.json',
];

let ok = true;
for (const rel of files) {
  const abs = join(ROOT, rel);
  const before = readFileSync(abs, 'utf8');
  // اولین تطابق ورژن semver در فایل همان فیلد version است (هدر توضیحات ورژن ندارد)
  const after = before.replace(/(\d+\.\d+\.\d+)/, NEW);
  if (after === before) {
    // idempotent: اگر ورژن همین حالا NEW است، موفق حساب کن (اجرای دوباره‌ی bump)
    if (before.includes(NEW)) { console.log(`  • ${rel} از قبل ${NEW} است`); continue; }
    console.error(`  ✖ ${rel}: ورژنی پیدا نشد`); ok = false; continue;
  }
  writeFileSync(abs, after);
  console.log(`  • ${rel} → ${NEW}`);
}
process.exitCode = ok ? 0 : 1;
