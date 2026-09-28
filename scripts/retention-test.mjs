// تست واحد applyRetention — با tsx اجرا می‌شود: npx tsx scripts/retention-test.mjs
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applyRetention } from '../server/src/lib/backup.js';

const dir = join(process.env.TEMP ?? '/tmp', 'ret_test');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
// ۵ بکاپ ساختگی (۳۱ آبان تا ۲ آبان — قدیمی → جدید)
for (let i = 1; i <= 5; i++) {
  writeFileSync(join(dir, `support-backup-2026102${i}-12000${i}.db`), 'x'.repeat(5000));
}
const deleted = applyRetention(dir, 3);
console.log('deleted:', deleted.length, '→', deleted.map((f) => f.slice(-8)).join(', '));
const remaining = readdirSync(dir).sort();
console.log('remaining:', remaining.length, '→', remaining.map((f) => f.slice(-8)).join(', '));
if (deleted.length !== 2 || remaining.length !== 3) {
  console.error('✖ retention test FAILED');
  process.exit(1);
}
console.log('✔ retention test PASSED');
rmSync(dir, { recursive: true, force: true });
