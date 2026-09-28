// ============================================================
// تجزیه‌ی clipboard اکسل برای ویرایشگر جدولی قطعات
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// ورودی: متن چسبانده‌شده از اکسل (TSV چندردیفی یا قالب فهرست انبار خود سامانه)
// خروجی: ردیف‌های GridPartRow + نگاشت تشخیص‌داده‌شده‌ی ستون‌ها که در
//        دیالوگ پیش‌نمایش قابل اصلاح است.
// ------------------------------------------------------------
// ستون‌ها به‌ترتیب به سه شکل شناسایی می‌شوند:
//   ۱) سرستون فارسی/انگلیسی شناخته‌شده (سریال تجهیز، نوع قطعه، عنوان قطعه، …)
//   ۲) قالب خروجی فهرست انبار خود سامانه (۶ ستون ثابت، بدون سرستون)
//   ۳) ترتیب عمومی هوشمند: هر ستون بر اساس محتوایش (الگوی تاریخ، پارت‌نامبر،
//      سریال بلند) و جایگاهش حدس زده می‌شود — کاربر در پیش‌نمایش اصلاح می‌کند.
// ============================================================
import type { GridPartRow } from '../pages/PartsGridEditor';

export type ClipField =
  | 'device_serial'
  | 'kind'
  | 'title'
  | 'part_number'
  | 'part_serial'
  | 'specs'
  | 'ignore';

export const FIELD_LABELS: Record<ClipField, string> = {
  device_serial: 'سریال تجهیز',
  kind: 'نوع قطعه',
  title: 'عنوان قطعه',
  part_number: 'پارت‌نامبر',
  part_serial: 'سریال قطعه',
  specs: 'مشخصات فنی',
  ignore: '— نادیده —',
};

/** سرستون‌های شناخته‌شده (فارسی + انگلیسی رایج) */
const HEADER_ALIASES: Record<string, ClipField> = {
  // سریال تجهیز
  'سریال تجهیز': 'device_serial', 'سریال دستگاه': 'device_serial', 'سریال تجهیزات': 'device_serial',
  'device serial': 'device_serial', 'sn': 'device_serial',
  // نوع
  'نوع قطعه': 'kind', 'نوع': 'kind', 'دسته': 'kind', 'kind': 'kind', 'type': 'kind', 'category': 'kind',
  // عنوان
  'عنوان قطعه': 'title', 'عنوان': 'title', 'شرح': 'title', 'شرح کالا': 'title', 'نام قطعه': 'title',
  'title': 'title', 'name': 'title', 'description': 'title', 'part name': 'title', 'item': 'title',
  // پارت‌نامبر
  'پارت‌نامبر': 'part_number', 'پارت نامبر': 'part_number', 'شماره قطعه': 'part_number', 'پارت‌نامبر ۱': 'part_number',
  'part number': 'part_number', 'part no': 'part_number', 'pn': 'part_number', 'p/n': 'part_number', 'mpn': 'part_number', 'code': 'part_number', 'part code': 'part_number',
  // سریال قطعه
  'سریال قطعه': 'part_serial', 'سریال': 'part_serial', 'شماره سریال': 'part_serial',
  'part serial': 'part_serial', 'serial number': 'part_serial', 's/n': 'part_serial', 'serial': 'part_serial',
  // مشخصات
  'مشخصات فنی': 'specs', 'مشخصات': 'specs', 'توضیحات': 'specs', 'spec': 'specs', 'specs': 'specs', 'specification': 'specs',
};

const FIELD_ORDER: ClipField[] = ['device_serial', 'kind', 'title', 'part_number', 'part_serial', 'specs'];

/** آیا رشته شبیه تاریخ شمسی است (۱۴۰۴/۰۵/۱۰ یا 1404-5-10 یا ۱۴۰۴/۵) */
export function looksLikeJalaliDate(s: string): boolean {
  const t = s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).trim();
  return /^1[34]\d{2}[/\-](1[0-2]|0?[1-9])[/\-]([0-2]?[1-9]|3[01])?$/.test(t) || /^1[34]\d{2}[/\-](1[0-2]|0?[1-9])$/.test(t);
}

/** آیا رشته شبیه پارت‌نامبر HPE/عمومی است (حروف+ارقام، معمولاً با خط تیره) */
function looksLikePartNumber(s: string): boolean {
  return /^[A-Z0-9][A-Z0-9\-]{4,20}$/i.test(s.trim()) && /\d/.test(s) && /[A-Z]/i.test(s) && !/\s/.test(s.trim());
}

/** آیا رشته شبیه سریال قطعه است (معمولاً بلندتر از پارت‌نامبر، بدون خط تیره‌ی وسط) */
function looksLikeSerial(s: string): boolean {
  const t = s.trim();
  return /^[A-Z0-9]{8,25}$/i.test(t) && /\d/.test(t) && /[A-Z]/i.test(t);
}

export interface ParsedClipboard {
  rows: { title: string; part_number_1: string; part_number_2: string; part_serial_number: string; tech_specs: string; device_serial: string }[];
  mapping: ClipField[];        // نقش هر ستون متن اصلی
  hadHeader: boolean;          // ردیف اول سرستون بود و حذف شد
  delimiter: '\t' | '|' | ';';
  rawColumns: number;
  /** سلول‌های خام برای بازسازی با mapping جدید در دیالوگ */
  rawCells: string[][];
}

/**
 * بازسازی ردیف‌ها از سلول‌های خام با نگاشت دلخواه — برای ویرایش نگاشت در دیالوگ
 */
export function rebuildRows(rawCells: string[][], mapping: ClipField[], hadHeader: boolean): ParsedClipboard['rows'] {
  const data = hadHeader ? rawCells.slice(1) : rawCells;
  return data
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const r = { title: '', part_number_1: '', part_number_2: '', part_serial_number: '', tech_specs: '', device_serial: '' };
      cells.forEach((cell, i) => {
        const f = mapping[i] ?? 'ignore';
        if (f === 'ignore' || !cell) return;
        switch (f) {
          case 'title': r.title = r.title ? `${r.title} ${cell}` : cell; break;
          case 'part_number': if (!r.part_number_1) r.part_number_1 = cell; else if (!r.part_number_2) r.part_number_2 = cell; break;
          case 'part_serial': r.part_serial_number = r.part_serial_number || cell; break;
          case 'specs': r.tech_specs = r.tech_specs ? `${r.tech_specs} ${cell}` : cell; break;
          case 'device_serial': r.device_serial = r.device_serial || cell; break;
          case 'kind': if (!r.title) r.title = cell; break;
        }
      });
      return r;
    })
    .filter((r) => r.title || r.part_number_1 || r.part_serial_number);
}

/**
 * تشخیص جداکننده: TSV اکسل (تب) پیش‌فرض؛ اگر تب نبود | یا ؛
 */
function detectDelimiter(text: string): '\t' | '|' | ';' {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  if (firstLine.includes('\t')) return '\t';
  const pipes = (firstLine.match(/\|/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (pipes >= 2 && pipes >= semis) return '|';
  if (semis >= 2) return ';';
  return '\t';
}

function splitLine(line: string, delim: '\t' | '|' | ';'): string[] {
  return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function mapHeaders(cells: string[]): { mapping: ClipField[]; hadHeader: boolean } {
  const mapping: ClipField[] = cells.map((c) => {
    const key = c.toLowerCase().replace(/[:٫.]/g, '').trim();
    return HEADER_ALIASES[key] ?? HEADER_ALIASES[c.replace(/[:٫.]/g, '').trim()] ?? 'ignore';
  });
  const recognized = mapping.filter((m) => m !== 'ignore').length;
  // سرستون فقط وقتی معتبر است که حداقل ۲ ستون شناخته شود و هیچ سلولی شبیه تاریخ/سریال نباشد
  const dateLike = cells.some((c) => looksLikeJalaliDate(c));
  const serialLike = cells.some((c) => looksLikeSerial(c));
  return { mapping: recognized >= 2 && !dateLike && !serialLike ? mapping : [], hadHeader: recognized >= 2 && !dateLike && !serialLike };
}

/** حدس هوشمند ترتیب ستون‌ها وقتی سرستون نیست — قالب ۶ ستونه‌ی فهرست انبار + حالت‌های عمومی */
function guessMapping(sampleRows: string[][]): ClipField[] {
  const cols = Math.max(...sampleRows.map((r) => r.length));
  const scores: Record<number, Partial<Record<ClipField, number>>> = {};
  for (let c = 0; c < cols; c++) {
    scores[c] = {};
    for (const row of sampleRows) {
      const cell = (row[c] ?? '').trim();
      if (!cell) continue;
      if (looksLikeJalaliDate(cell)) scores[c].device_serial = (scores[c].device_serial || 0) + 0; // تاریخ قطعه در قالب انبار نیست؛ نادیده
      if (looksLikeSerial(cell)) scores[c].part_serial = (scores[c].part_serial || 0) + 2;
      if (looksLikePartNumber(cell)) {
        scores[c].part_number = (scores[c].part_number || 0) + 2;
        scores[c].part_serial = (scores[c].part_serial || 0) + 1; // مبهم: سریال هم می‌تواند باشد
      }
      // متن فارسی/بلند = عنوان یا مشخصات
      if (/[\u0600-\u06FF]/.test(cell) || cell.split(/\s+/).length >= 2) {
        scores[c].title = (scores[c].title || 0) + 1.5;
        scores[c].kind = (scores[c].kind || 0) + 0.5;
        scores[c].specs = (scores[c].specs || 0) + 0.5;
      }
    }
  }
  // قالب ۶ ستونه‌ی فهرست انبار خود سامانه: سریال تجهیز | نوع | عنوان | پارت‌نامبر | سریال | مشخصات
  if (cols === 6) return [...FIELD_ORDER];
  if (cols === 5) return ['kind', 'title', 'part_number', 'part_serial', 'specs'];
  if (cols === 4) return ['title', 'part_number', 'part_serial', 'specs'];

  // حالت عمومی: به هر ستون بهترین برچسب اختصاص — بدون تکرار، به ترتیب اولویت
  const result: ClipField[] = new Array(cols).fill('ignore');
  const taken = new Set<ClipField>();
  // ستون‌های پرامتیاز سریال/پارت‌نامبر اول تخصیص می‌یابند
  for (let c = 0; c < cols; c++) {
    const s = scores[c];
    const bestSerial = (s.part_serial || 0) >= (s.part_number || 0) ? 'part_serial' : 'part_number';
    if ((s[bestSerial] || 0) >= 2 && !taken.has(bestSerial)) { result[c] = bestSerial; taken.add(bestSerial); }
  }
  // اولین ستون متنی = عنوان
  if (!taken.has('title')) {
    for (let c = 0; c < cols; c++) {
      if (result[c] === 'ignore' && (scores[c].title || 0) > 0) { result[c] = 'title'; taken.add('title'); break; }
    }
  }
  // بعدی‌های متنی: اول kind، بعد specs
  for (const f of ['kind', 'specs'] as ClipField[]) {
    if (taken.has(f)) continue;
    for (let c = 0; c < cols; c++) {
      if (result[c] === 'ignore' && (scores[c][f] || 0) > 0) { result[c] = f; taken.add(f); break; }
    }
  }
  return result;
}

/**
 * تجزیه‌ی متن چسبانده‌شده از اکسل به ردیف‌های گرید.
 * mapping برگشتی قابل تغییر در دیالوگ پیش‌نمایش است.
 */
export function parseClipboardParts(text: string): ParsedClipboard | null {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
  if (!clean.trim()) return null;
  const delimiter = detectDelimiter(clean);
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;

  const allCells = lines.map((l) => splitLine(l, delimiter));
  const { mapping: headerMapping, hadHeader } = mapHeaders(allCells[0]);

  let mapping: ClipField[];
  let dataRows: string[][];
  if (headerMapping.length) {
    mapping = headerMapping;
    dataRows = allCells.slice(1);
  } else {
    mapping = guessMapping(allCells);
    dataRows = allCells;
  }

  if (mapping.every((m) => m === 'ignore')) return null;

  const rows = dataRows
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const r = { title: '', part_number_1: '', part_number_2: '', part_serial_number: '', tech_specs: '', device_serial: '' };
      cells.forEach((cell, i) => {
        const f = mapping[i] ?? 'ignore';
        if (f === 'ignore' || !cell) return;
        switch (f) {
          case 'title': r.title = r.title ? `${r.title} ${cell}` : cell; break;
          case 'part_number': r.part_number_1 = r.part_number_1 || cell; break;
          case 'part_serial': r.part_serial_number = r.part_serial_number || cell; break;
          case 'specs': r.tech_specs = r.tech_specs ? `${r.tech_specs} ${cell}` : cell; break;
          case 'device_serial': r.device_serial = r.device_serial || cell; break;
          case 'kind': /* نوع قطعه در گرید جای مستقیم ندارد — به عنوان می‌چسبد اگر عنوان خالی بماند */ if (!r.title) r.title = cell; break;
        }
      });
      return r;
    })
    .filter((r) => r.title || r.part_number_1 || r.part_serial_number);

  if (rows.length === 0) return null;
  return { rows, mapping, hadHeader, delimiter, rawColumns: mapping.length, rawCells: allCells };
}

/** تبدیل خروجی تجزیه به ردیف‌های گرید با تاریخ پیش‌فرض */
export function toGridRows(parsed: ParsedClipboard, defaultSoldAt: string): GridPartRow[] {
  return parsed.rows.map((r, i) => ({
    key: `p${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    title: r.title,
    part_number_1: r.part_number_1,
    part_number_2: r.part_number_2,
    part_serial_number: r.part_serial_number,
    tech_specs: r.tech_specs,
    sold_at_jalali: defaultSoldAt,
  }));
}
