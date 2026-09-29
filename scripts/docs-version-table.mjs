// ============================================================
// ماژول مشترک جداول نسخه‌های مستندات — منطق واحد درج و چک
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// هم bump-version (درج ردیف جدید) و هم check-docs-sync (چک ترتیب نزولی)
// از همین توابع استفاده می‌کنند تا منطق «بالای جدول + مقایسه‌ی عددی»
// هرگز دوباره واگرا نشود.
// ============================================================

/** مقایسه‌ی عددی عنصر به عنصر دو آرایه‌ی ورژن — خروجی: مثبت اگر a > b، منفی اگر a < b، صفر اگر برابر */
export function cmpVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const da = a[i] ?? 0;
    const db = b[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/** استخراج آرایه‌ی ورژن از سلول متنی (مثل `1.13.3` یا **1.13.3** یا v1.2.0) */
export function parseVersion(cell) {
  const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(cell);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** ساختار یک جدول نسخه: هدینگ + سطر جدول‌کننده + ردیف‌های نسخه */
export function findVersionTable(text, heading) {
  const hi = text.indexOf(heading);
  if (hi < 0) return null;
  const rest = text.slice(hi);
  const sep = rest.match(/^\|(?:-{2,}\|)+\r?\n/m);
  if (!sep) return null;
  const sepIndex = hi + sep.index;
  const sepEnd = sepIndex + sep[0].length;
  const rows = [];
  let pos = sepEnd;
  for (;;) {
    const nl = text.indexOf('\n', pos);
    const line = text.slice(pos, nl < 0 ? text.length : nl).replace(/\r$/, '');
    if (!line.startsWith('|') || !line.trim()) break;
    rows.push({ line, start: pos, end: nl < 0 ? text.length : nl });
    if (nl < 0) break;
    pos = nl + 1;
  }
  return { headingIndex: hi, sepIndex, sepEnd, rows };
}

/**
 * درج ردیف نسخه‌ی جدید «بالای جدول» (بلافاصله بعد از سطر جدول‌کننده) —
 * همان مکانی که checkDescending انتظار دارد. اگر ورژن بالاتر از ردیف اول نباشد خطا می‌دهد.
 */
export function insertRowUnderHead(text, heading, newRow) {
  const t = findVersionTable(text, heading);
  if (!t) return null;
  // چک عددی: ردیف جدید باید بالاترین نسخه باشد (ترتیب نزولی حفظ شود)
  const first = t.rows[0];
  if (first) {
    const firstV = parseVersion((first.line.split('|')[1] ?? '').trim());
    const newV = parseVersion((newRow.split('|')[1] ?? '').trim());
    if (firstV && newV && cmpVersions(newV, firstV) <= 0) {
      throw new Error(`ورژن جدید (${newV.join('.')}) باید بالاتر از ردیف اول جدول (${firstV.join('.')}) باشد.`);
    }
  }
  const nlAfter = text.charAt(t.sepEnd) === '\r' ? t.sepEnd + 1 : t.sepEnd;
  const insertAt = text.charAt(nlAfter) === '\n' ? nlAfter + 1 : nlAfter;
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, insertAt) + newRow + lineEnding + text.slice(insertAt);
}

/**
 * چک ترتیب نزولی یک جدول نسخه — خروجی: فهرست خطاها (خالی = سالم).
 * گزینه‌ها: latestTop/emberBottom برای جدول تگ‌های Docker Hub.
 */
export function checkDescendingTable(text, heading, { latestTop = false, emberBottom = false } = {}) {
  const errors = [];
  const t = findVersionTable(text, heading);
  if (!t) {
    errors.push(`سرفصل «${heading.trim()}» یا سطر جدول‌کننده یافت نشد.`);
    return errors;
  }
  let prev = null;
  for (let i = 0; i < t.rows.length; i++) {
    const cell = (t.rows[i].line.split('|')[1] ?? '').trim().replace(/[`*]/g, '');
    let v;
    if (cell === 'latest') {
      if (!latestTop) errors.push(`ردیف «latest» فقط باید بالای جدول تگ‌ها باشد (ردیف جدول ${i + 1}).`);
      v = [Number.POSITIVE_INFINITY];
    } else if (cell === 'ember') {
      if (!emberBottom) errors.push(`ردیف «ember» باید پایین جدول تگ‌ها باشد (ردیف جدول ${i + 1}).`);
      v = [Number.NEGATIVE_INFINITY];
    } else {
      v = parseVersion(cell);
      if (!v) continue; // ردیف غیرنسخه‌ای (مثلاً سرگروه) — نادیده گرفته می‌شود
      if (prev && cmpVersions(v, prev) > 0) {
        errors.push(`ترتیب نزولی رعایت نشده — ردیف جدول ${i + 1} (نسخه ${cell}) بعد از نسخه‌ی بزرگ‌تر آمده است. ردیف نسخه‌ی جدید باید بالای جدول (بعد از سطر هدر) درج شود.`);
      }
    }
    if (v) prev = v;
  }
  return errors;
}
