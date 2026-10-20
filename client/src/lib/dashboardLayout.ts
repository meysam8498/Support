// ============================================================
// چیدمان قابل سفارشی‌سازی داشبورد — الگوی Microsoft CRM / Dynamics
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ------------------------------------------------------------
// ویجت‌ها را می‌توان جابه‌جا (ری‌اکشن drag یا دکمه‌ی ↑/↓ برای کیبورد) و
// مخفی کرد؛ چیدمان هر کاربر در localStorage با کلید «user:<id>» می‌ماند.
// این ماژول «منطق خالص» است (بدون DOM/React) تا تست واحد بگیرد:
//   • normalizeLayout → همیشه ترکیبی کامل و معتبر از DEFAULT_ORDER
//   • applyLayout     → ترتیب نهایی ویجت‌های «قابل‌نمایش» (اعمال مخفی‌ها + حذف ناشناخته‌ها)
//   • moveWidget      → جابه‌جایی ↑/↓ با پرش از روی ویجت‌های مخفی‌شده
//   • dropWidget      → ری‌ Drop کشیدنی: from را در جای to می‌نشاند
// ============================================================

/** عرض ویجت در شبکه‌ی داشبورد — full = دو ستون، half = یک ستون (جفت می‌شوند) */
export type WidgetSpan = 'full' | 'half';

/** تعریف یک ویجت داشبورد — id پایدار برای ماندگاری چیدمان */
export interface WidgetDef {
  id: string;
  /** برچسب فارسی در نوار کنترل حالت سفارشی‌سازی */
  title: string;
  span: WidgetSpan;
}

/** چیدمان ذخیره‌شده‌ی یک کاربر */
export interface LayoutState {
  /** ترتیب نمایش ویجت‌ها (id) */
  order: string[];
  /** ویجت‌های مخفی‌شده توسط کاربر */
  hidden: string[];
}

/**
 * ترتیب پیش‌فرض همه‌ی ویجت‌ها — منبع واحد جهت‌گیری.
 * «welcome» سربرگ خوش‌آمد (H1) است؛ کارت «درباره» و بنر ارتقا عمداً ویجت
 * نیستند و بالای تخته ثابت می‌مانند. ویجت‌های نقش‌محور (بکاپ/لایسنس فقط
 * ادمین) اینجا هستند تا چیدمان ادمین هنگام نبودِ موقتِ داده جای‌اش را حفظ کند.
 */
export const DEFAULT_ORDER: readonly string[] = [
  'welcome',
  'backup',
  'license',
  'stats',
  'progress',
  'trend',
  'topParts',
  'quickReport',
  'recent',
  'projects',
  'actions',
];

/** ایده‌ی ذخیره‌سازی — چیدمان هر کاربر جدا از بقیه */
export function layoutKeyFor(userId: number | string | undefined | null): string {
  return `dash-layout:v1:user:${userId ?? 'anon'}`;
}

/** بازگردانی ترتیب پیش‌فرض (کپی، بدون اشتراک آرایه) */
export function defaultOrder(): string[] {
  return [...DEFAULT_ORDER];
}

/**
 * نرمال‌سازی چیدمان: ترتیب همیشه دقیقاً یک جایگشت کامل از DEFAULT_ORDER است.
 * idهای ناشناخته/قدیمی حذف و idهای تازه (اضافه‌شده به اپ) در جای پیش‌فرض می‌نشینند؛
 * مخفی‌ها هم فقط به ویجت‌های شناخته‌شده محدود می‌شوند. ورودی خراب/ناقص امن است.
 */
export function normalizeLayout(state: Partial<LayoutState> | null | undefined): LayoutState {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of Array.isArray(state?.order) ? state!.order : []) {
    if (DEFAULT_ORDER.includes(id) && !seen.has(id)) { order.push(id); seen.add(id); }
  }
  // ویجت‌های تازه یا جامانده را به‌ترتیب پیش‌فرض، «بعد» از موارد موجود می‌گذاریم
  for (const id of DEFAULT_ORDER) if (!seen.has(id)) { order.push(id); seen.add(id); }
  const hidden = (Array.isArray(state?.hidden) ? state!.hidden : []).filter((id) => DEFAULT_ORDER.includes(id));
  return { order, hidden };
}

/** خواندن چیدمان از localStorage — خطای ذخیره/داده‌ی خراب → پیش‌فرض */
export function loadLayout(key: string): LayoutState {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return normalizeLayout(null);
    return normalizeLayout(JSON.parse(raw) as Partial<LayoutState>);
  } catch {
    return normalizeLayout(null);
  }
}

/** نوشتن چیدمان در localStorage — شکست ذخیره (حالت خصوصی/پر) بی‌صدا نادیده گرفته می‌شود */
export function saveLayout(key: string, state: LayoutState): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(normalizeLayout(state)));
  } catch {
    /* ذخیره‌سازی در دسترس نیست — چیدمان فقط برای همین نشست می‌ماند */
  }
}

/**
 * اعمال چیدمان روی ویجت‌های «موجود» (نقش/داده): خروجی = ویجت‌های قابل‌نمایش
 * به‌ترتیب چیدمان. ویجت مخفی حذف؛ ویجت ناشناخته (نقش دیگر) نادیده گرفته می‌شود.
 */
export function applyLayout<T extends WidgetDef>(defs: T[], state: LayoutState): T[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const rank = new Map(state.order.map((id, i) => [id, i]));
  const out: T[] = [];
  for (const id of state.order) {
    if (state.hidden.includes(id)) continue;
    const def = byId.get(id);
    if (def) out.push(def);
  }
  // ویجت‌های موجودی که در order نیستند (داده‌ی نو/ناشناخته) — در انتها به‌ترتیب تعریف
  for (const def of defs) {
    if (!rank.has(def.id) && !state.hidden.includes(def.id) && !out.includes(def)) out.push(def);
  }
  return out;
}

/**
 * ویجت‌های «قابل‌نمایش» به‌ترتیب order — پایه‌ی جابه‌جایی ↑/↓ و ری‌ Drop.
 * حاضر = هم در نقش/داده‌ی فعلی هست (present) و هم مخفی نشده (hidden).
 */
function visibleSeq(order: readonly string[], present: ReadonlySet<string>, hidden: readonly string[]): string[] {
  return order.filter((o) => present.has(o) && !hidden.includes(o));
}

/** بازسازی order با جایگزینی «جای‌های قابل‌نمایش» توسط ترتیب تازه‌ی visible */
function rebuild(order: readonly string[], present: ReadonlySet<string>, hidden: readonly string[], visible: string[]): string[] {
  let i = 0;
  return order.map((o) => (present.has(o) && !hidden.includes(o) ? visible[i++] : o));
}

/**
 * جابه‌جایی کیبوردی (↑/↓) — فقط میان ویجت‌های «قابل‌نمایشِ» فعلی.
 * برای کاربر غیرادمین، بکاپ/لایسنس حاضر نیستند پس ↑/↓ از روی‌شان «پرش» می‌کند
 * (وگرنه دکمه‌ی ↑ چند بار بی‌اثر می‌زد). ویجت‌های مخفی هم رد می‌شوند.
 */
export function moveWidget(
  order: readonly string[],
  id: string,
  dir: -1 | 1,
  present: ReadonlySet<string>,
  hidden: readonly string[],
): string[] {
  const visible = visibleSeq(order, present, hidden);
  const from = visible.indexOf(id);
  const to = from + dir;
  if (from === -1 || to < 0 || to >= visible.length) return [...order];
  [visible[from], visible[to]] = [visible[to], visible[from]];
  return rebuild(order, present, hidden, visible);
}

/**
 * ری‌ Drop کشیدنی: ویجت from را کنار to می‌نشاند — فقط میان قابل‌نمایش‌ها
 * (شاخص آرایه‌ای، پس برای RTL هم درست است: جهت فیزیکی را CSS می‌سازد).
 */
export function dropWidget(
  order: readonly string[],
  fromId: string,
  toId: string,
  present: ReadonlySet<string>,
  hidden: readonly string[],
): string[] {
  if (fromId === toId) return [...order];
  const visible = visibleSeq(order, present, hidden);
  const from = visible.indexOf(fromId);
  const to = visible.indexOf(toId);
  if (from === -1 || to === -1) return [...order];
  const [item] = visible.splice(from, 1);
  visible.splice(to, 0, item);
  return rebuild(order, present, hidden, visible);
}

/** نمایش/پنهان‌کردن یک ویجت — toggle */
export function toggleHidden(hidden: string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}
