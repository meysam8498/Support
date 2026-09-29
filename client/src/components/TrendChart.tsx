// ============================================================
// نمودار ستونی روند ماهانه + خروجی PNG (بدون وابستگی خارجی)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • رندر SVG سبک RTL-سازگار با برچسب ماه شمسی
// • exportChartPng: تبدیل SVG به PNG با canvas (پس‌زمینه روشن) برای گزارش مدیریتی
// ============================================================
import React, { useRef } from 'react';
import { toFa } from '../lib/date';

export interface TrendMonth {
  year: number;
  month: number;
  label: string;
  count: number;
}

/** تبدیل SVG نمودار به PNG و دانلود — برای گزارش مدیریتی */
export async function exportChartPng(svg: SVGSVGElement | null, fileName: string, title: string): Promise<void> {
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const W = Math.max(600, Math.round(rect.width));
  const H = Math.max(300, Math.round(rect.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // CSS کلاس‌ها (tailwind) در SVG مستقل اعمال نمی‌شوند — رنگ‌ها inline تزریق می‌کنیم
  const bg = '<rect width="100%" height="100%" fill="#fafaf9"/>';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}${clone.innerHTML}</svg>`;
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('رندر تصویر نمودار ناموفق بود.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    // ۲x برای وضوح در گزارش چاپی
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas در دسترس نیست.');
    ctx.scale(2, 2);
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    // عنوان بالای تصویر
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 16px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(title, W - 16, 26);
    const out = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = out;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Props {
  months: TrendMonth[];
  /** عنوان برای PNG (فارسی) */
  pngTitle?: string;
  /** نام فایل PNG */
  pngFileName?: string;
}

/** نمودار ستونی SVG روند ماهانه — RTL، بدون وابستگی خارجی، با دکمه‌ی PNG */
export default function TrendChart({ months, pngTitle, pngFileName }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const max = Math.max(1, ...months.map((m) => m.count));
  const W = Math.max(600, months.length * 46 + 40);
  const H = 240;
  const padB = 28;
  const padT = 14;
  const barArea = H - padB - padT;
  const bw = Math.min(32, (W - 40) / months.length - 8);
  const step = (W - 40) / months.length;

  const downloadPng = () => {
    void exportChartPng(svgRef.current, pngFileName || `trend-${new Date().toISOString().slice(0, 10)}.png`, pngTitle || 'روند تعویض‌های ماهانه').catch(() => { /* noop */ });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نمودار روند ماهانه‌ی تعویض‌ها">
          {/* خط پایه */}
          <line x1={16} y1={H - padB} x2={W - 16} y2={H - padB} stroke="#d6d3d1" strokeWidth={1} />
          {months.map((m, i) => {
            const h = m.count > 0 ? Math.max(6, (m.count / max) * barArea) : 2;
            const x = 20 + i * step + (step - bw) / 2;
            const y = H - padB - h;
            const isLast = i === months.length - 1;
            const fill = isLast ? '#c2410c' : m.count > 0 ? '#fdba74' : '#e7e5e4';
            return (
              <g key={`${m.year}-${m.month}`}>
                <title>{`${m.label} ${toFa(m.year)}: ${toFa(m.count)} تعویض`}</title>
                {m.count > 0 && (
                  <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#57534e">{toFa(m.count)}</text>
                )}
                <rect x={x} y={y} width={bw} height={h} rx={4} fill={fill} />
                <text x={x + bw / 2} y={H - padB + 14} textAnchor="middle" fontSize={9} fill={isLast ? '#c2410c' : '#a8a29e'} fontWeight={isLast ? 'bold' : 'normal'}>
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {pngTitle && (
        <div className="flex justify-end">
          <button type="button" onClick={downloadPng} className="btn-ghost !min-h-[28px] text-[11px]" title="دانلود نمودار به‌صورت تصویر PNG برای گزارش">
            🖼️ خروجی PNG
          </button>
        </div>
      )}
    </div>
  );
}
