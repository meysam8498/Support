// ============================================================
// تخته‌ی ویجت‌های داشبورد — الگوی Microsoft CRM / Dynamics
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ------------------------------------------------------------
// الگوی مصرف: فرزندان مستقیم باید <Widget id title span> باشند (هر کدام JSX
// ویجت را «در جای خودش» نگه می‌دارند). WidgetBoard این‌ها را می‌خواند، با
// چیدمان کاربر مرتب/فیلتر می‌کند و در شبکه رندر می‌کند — یعنی هیچ JSX ای
// از صفحه جابه‌جا نمی‌شود، فقط درون تخته قرار می‌گیرد.
//
// • حالت «سفارشی‌سازی»: دسته‌ی کشیدن، دکمه‌های ↑/↓ (کیبورد) و دکمه‌ی چشم.
// • کشیدن با HTML5 Drag & Drop — بدون وابستگی خارجی؛ جابه‌جایی شاخص آرایه‌ای
//   پس برای RTL هم درست است (جهت فیزیکی را CSS می‌سازد).
// • چیدمان هر کاربر در localStorage (layoutKeyFor) + دکمه‌ی بازگشت به پیش‌فرض.
// • بیرون از حالت ویرایش، ویجت‌ها بدون کادر/دسته رندر می‌شوند (ظاهر تمیز).
// ============================================================
import React, { Children, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type LayoutState,
  type WidgetDef,
  type WidgetSpan,
  applyLayout,
  defaultOrder,
  dropWidget,
  layoutKeyFor,
  loadLayout,
  moveWidget,
  normalizeLayout,
  saveLayout,
  toggleHidden,
} from '../lib/dashboardLayout';

/** props یک ویجت — id پایدار + عنوان کنترلی + عرض در شبکه */
export interface WidgetProps {
  id: string;
  title: string;
  span?: WidgetSpan;
  children: React.ReactNode;
}

/**
 * ویجت شفاف — فقط JSX خودش را برمی‌گرداند؛ هویتش (id/title/span) را
 * WidgetBoard از روی element می‌خواند. تا صفحه‌ی والد همه‌ی بخش‌ها را
 * «در جای طبیعی‌شان» بنویسد و تخته فقط ترتیب/نمایش را مدیریت کند.
 */
export function Widget({ children }: WidgetProps) {
  return <>{children}</>;
}

interface WidgetBoardProps {
  /** فرزندان: هر کدام یک <Widget> — ترتیب اولیه‌شان بی‌اثر است (چیدمان حکم می‌کند) */
  children: React.ReactNode;
  /** شناسه‌ی کاربر برای جداسازی چیدمان per-user */
  userId?: number | string;
}

/** استخراج defs + نگاشت element از فرزندان <Widget> (بدون لمس بقیه‌ی گره‌ها) */
function collectWidgets(children: React.ReactNode): { defs: WidgetDef[]; byId: Map<string, React.ReactElement> } {
  const defs: WidgetDef[] = [];
  const byId = new Map<string, React.ReactElement>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const p = child.props as Partial<WidgetProps>;
    if (typeof p.id !== 'string') continue;
    defs.push({ id: p.id, title: p.title ?? p.id, span: p.span ?? 'full' });
    byId.set(p.id, child as React.ReactElement);
  }
  return { defs, byId };
}

export default function WidgetBoard({ children, userId }: WidgetBoardProps) {
  const storageKey = useMemo(() => layoutKeyFor(userId), [userId]);
  const [state, setState] = useState<LayoutState>(() => loadLayout(storageKey));
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // اعلام‌کننده‌ی بصری برای صفحه‌خوان — تغییرات چیدمان با کیبورد را اعلام می‌کند
  const [live, setLive] = useState('');

  // اگر کاربر عوض شد (یا کلید عوض شد)، چیدمان همان را بخوان
  useEffect(() => {
    setState(loadLayout(storageKey));
  }, [storageKey]);

  const { defs, byId } = useMemo(() => collectWidgets(children), [children]);

  const commit = useCallback((next: LayoutState) => {
    const norm = normalizeLayout(next);
    setState(norm);
    saveLayout(storageKey, norm);
  }, [storageKey]);

  // ویجت‌های قابل‌نمایش به‌ترتیب چیدمان (اعمال مخفی‌ها + ویجت‌های تازه)
  const visible = useMemo(() => applyLayout(defs, state), [defs, state]);

  const toggleEdit = () => {
    setEditing((e) => {
      setLive(
        e
          ? 'حالت سفارشی‌سازی بسته شد — چیدمان ذخیره شد.'
          : 'حالت سفارشی‌سازی: می‌توانید ویجت‌ها را با کشیدن یا دکمه‌های بالا/پایین جابه‌جا و مخفی کنید.',
      );
      return !e;
    });
  };

  const move = (id: string, dir: -1 | 1, title: string) => {
    // فقط میان ویجت‌های قابل‌نمایش (نقش/داده‌ی فعلی + مخفی‌نشده) جابه‌جا می‌شود
    const present = new Set(defs.map((d) => d.id));
    const order = moveWidget(state.order, id, dir, present, state.hidden);
    if (order.join() === state.order.join()) return; // در مرز بالا/پایین
    commit({ ...state, order });
    setLive(`«${title}» ${dir === -1 ? 'بالاتر' : 'پایین‌تر'} رفت.`);
  };

  const hide = (id: string, title: string) => {
    commit({ ...state, hidden: toggleHidden(state.hidden, id) });
    setLive(`«${title}» مخفی شد. برای بازگردانی از فهرست ویجت‌های مخفی استفاده کنید.`);
  };

  const unhide = (id: string, title: string) => {
    commit({ ...state, hidden: state.hidden.filter((h) => h !== id) });
    setLive(`«${title}» نمایش داده شد.`);
  };

  const reset = () => {
    commit({ order: defaultOrder(), hidden: [] });
    setLive('چیدمان به حالت پیش‌فرض بازگشت.');
  };

  // ───── Drag & Drop (HTML5) ─────
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox برای شروع drag به setData نیاز دارد
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  };
  const onDrop = (e: React.DragEvent, toId: string) => {
    e.preventDefault();
    if (!dragId) return;
    const present = new Set(defs.map((d) => d.id));
    const movedTitle = defs.find((d) => d.id === dragId)?.title ?? '';
    const targetTitle = defs.find((d) => d.id === toId)?.title ?? '';
    commit({ ...state, order: dropWidget(state.order, dragId, toId, present, state.hidden) });
    setLive(`«${movedTitle}» به جای «${targetTitle}» منتقل شد.`);
    setDragId(null);
    setOverId(null);
  };
  const onDragEnd = () => { setDragId(null); setOverId(null); };

  // ویجت‌های مخفی‌شده‌ی همین کاربر — برای بازگردانی در حالت سفارشی‌سازی
  const hiddenDefs = defs.filter((d) => state.hidden.includes(d.id));

  return (
    <div data-testid="widget-board">
      {/* ───── نوار ابزار سفارشی‌سازی ───── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleEdit}
            aria-pressed={editing}
            className={editing ? 'btn-primary min-h-[32px] text-xs' : 'btn-ghost min-h-[32px] text-xs'}
            title="جابه‌جایی، مرتب‌کردن و مخفی‌کردن کارت‌های داشبورد — ذخیره‌ی خودکار برای همین کاربر"
          >
            {editing ? '✓ اتمام سفارشی‌سازی' : '🛠️ سفارشی‌سازی داشبورد'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="btn-ghost min-h-[32px] text-xs"
              title="بازگرداندن ترتیب و نمایش همه‌ی ویجت‌ها به حالت پیش‌فرض"
            >
              ↺ بازگشت به پیش‌فرض
            </button>
          )}
        </div>
        {editing && (
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            ویجت‌ها را بکشید یا با ↑/↓ جابه‌جا کنید؛ با چشم مخفی کنید. چیدمان ویژه‌ی شما ذخیره می‌شود.
          </p>
        )}
      </div>

      {/* فهرست ویجت‌های مخفی (فقط در حالت سفارشی‌سازی) — برای بازگردانی */}
      {editing && hiddenDefs.length > 0 && (
        <div className="mb-4 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 p-3">
          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-2">
            ویجت‌های مخفی‌شده ({hiddenDefs.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenDefs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => unhide(d.id, d.title)}
                className="chip chip-default min-h-[28px] text-xs"
                title={`نمایش دوباره‌ی «${d.title}»`}
              >
                👁 {d.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ───── شبکه‌ی ویجت‌ها — در حالت عادی فقط div ساده (کمینه‌کردن تغییر ساختار a11y) ───── */}
      {/* grid-flow-row-dense: اگر ویجت تمام‌عرض میان دو نیم‌عرض نشست، جای خالی با ویجت بعدی پر شود (بدون حفره) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 grid-flow-row-dense" role={editing ? 'list' : undefined}>
        {visible.map((def) => {
          const child = byId.get(def.id);
          if (!child) return null;
          const dragging = dragId === def.id;
          const over = overId === def.id;
          return (
            <div
              key={def.id}
              role={editing ? 'listitem' : undefined}
              data-widget-id={def.id}
              draggable={editing}
              onDragStart={editing ? (e) => onDragStart(e, def.id) : undefined}
              onDragOver={editing ? (e) => onDragOver(e, def.id) : undefined}
              onDrop={editing ? (e) => onDrop(e, def.id) : undefined}
              onDragEnd={editing ? onDragEnd : undefined}
              className={[
                def.span === 'full' ? 'lg:col-span-2' : '',
                editing
                  ? 'rounded-xl border-2 border-dashed p-3 transition-colors ' +
                    (dragging ? 'opacity-50 border-brand-400 ' : '') +
                    (over && !dragging
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 '
                      : 'border-stone-300 dark:border-stone-600 ')
                  : '',
              ].join(' ')}
            >
              {editing && (
                <div className="flex items-center justify-between gap-2 mb-2 select-none">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* دسته‌ی کشیدن — با کیبورد هم ↑/↓ کار می‌کند */}
                    <span
                      className="cursor-grab active:cursor-grabbing text-stone-400 dark:text-stone-500 text-sm px-1"
                      title="برای جابه‌جایی بکشید"
                      aria-hidden
                    >
                      ⠿
                    </span>
                    <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 truncate">{def.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(def.id, -1, def.title)}
                      className="btn-ghost min-h-[24px] px-1.5 text-xs leading-none"
                      aria-label={`انتقال «${def.title}» بالاتر`}
                      title="بالاتر"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(def.id, 1, def.title)}
                      className="btn-ghost min-h-[24px] px-1.5 text-xs leading-none"
                      aria-label={`انتقال «${def.title}» پایین‌تر`}
                      title="پایین‌تر"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => hide(def.id, def.title)}
                      className="btn-ghost min-h-[24px] px-1.5 text-xs leading-none"
                      aria-label={`مخفی کردن «${def.title}»`}
                      title="مخفی کردن"
                    >
                      👁️‍🗨️
                    </button>
                  </div>
                </div>
              )}
              {child}
            </div>
          );
        })}
      </div>

      {/* اعلام‌کننده‌ی تغییرات برای صفحه‌خوان (aria-live) */}
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
    </div>
  );
}
