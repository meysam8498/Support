// ============================================================
// سازنده‌ی مشترک خروجی اکسل «فهرست انبار» — قالب ردیف‌محور
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// خروجی با همان قالبی تولید می‌شود که ورود سریال می‌خواند (نسخه‌ی ۲):
//   سریال تجهیز | نوع قطعه | عنوان قطعه | پارت‌نامبر | سریال قطعه | مشخصات فنی
// نتیجه: چرخه‌ی اکسل دوطرفه — خروجی از سامانه مستقیماً قابل ورود دوباره است
// (و به‌دلیل تطبیق اسلاتی، ورود مجدد خروجی هیچ دوباره‌سازی نمی‌کند).
// ============================================================
import * as XLSX from 'xlsx';
import jalaali from 'jalaali-js';

export interface WarehouseExportRow {
  deviceSerial: string; // سریال تجهیز (خالی برای قطعات بدون دستگاه)
  kind: string;         // نوع قطعه
  title: string;        // عنوان قطعه
  partNumber: string;   // پارت‌نامبر
  partSerial: string;   // سریال قطعه
  specs: string;        // مشخصات فنی
}

/** ردیف هدر قالب — مرجع واحد برای export و import */
export const WAREHOUSE_HEADERS = ['سریال تجهیز', 'نوع قطعه', 'عنوان قطعه', 'پارت‌نامبر', 'سریال قطعه', 'مشخصات فنی'];

const todayJalali = (): string => {
  const j = jalaali.toJalaali(new Date());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
};

/**
 * ساخت workbook «فهرست انبار».
 * شیت اول: داده (قالب ردیف‌محور) — شیت دوم: راهنما.
 */
export function buildWarehouseWorkbook(
  rows: WarehouseExportRow[],
  meta: { title: string; note?: string }
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- شیت ۱: داده ---
  const data = rows.map((r) => [
    r.deviceSerial, r.kind, r.title, r.partNumber, r.partSerial, r.specs,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([WAREHOUSE_HEADERS, ...data]);
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 26 }];
  ws['!freeze'] = { xSplit: '0', ySplit: '1' }; // ثابت‌ماندن هدر در پیمایش
  XLSX.utils.book_append_sheet(wb, ws, 'فهرست انبار');

  // --- شیت ۲: راهنما ---
  const guide: (string | null)[][] = [
    [meta.title],
    [`تاریخ خروجی: ${todayJalali()}`],
    [meta.note || 'این فایل با همان قالب «ورود سریال از اکسل» قابل بازخورد به سامانه است.'],
    [''],
    ['ستون', 'توضیح'],
    ['سریال تجهیز', 'سریال دستگاهی که قطعه روی آن نصب است — در ورود مجدد، دستگاه مقصد را مشخص می‌کند.'],
    ['نوع قطعه', 'نوع/دسته‌ی قطعه.'],
    ['عنوان قطعه', 'عنوان نمایشی قطعه.'],
    ['پارت‌نامبر', 'کلید تطبیق — ردیف‌های هم‌پارت‌نامبر به‌ترتیب به اسلات‌های همان دستگاه وصل می‌شوند.'],
    ['سریال قطعه', 'سریال منحصربه‌فرد قطعه.'],
    ['مشخصات فنی', 'توضیحات تکمیلی/مدل.'],
    [''],
    ['سامانه', 'Support Equipment Management — طراحی: میثم ایجادی / M.Ijadi@Hotmail.com'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 16 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'راهنما');

  return wb;
}

/** سریال‌سازی نام فایل خروجی — فقط نویسه‌های امن برای Content-Disposition */
export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

/** ارسال workbook به‌صورت پاسخ دانلود */
export function sendWorkbook(res: import('express').Response, wb: XLSX.WorkBook, fileName: string): void {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(fileName)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
}
