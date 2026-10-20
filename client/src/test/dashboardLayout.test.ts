// ============================================================
// تست واحد موتور چیدمان داشبورد — منطق خالص (بدون DOM/React)
// ------------------------------------------------------------
// • normalizeLayout: جایگشت کامل از DEFAULT_ORDER با هر ورودی خراب/ناقص/ناشناخته
// • applyLayout: اعمال مخفی‌ها + حذف ناشناخته‌ها + الحاق ویجت‌های تازه
// • moveWidget: جابه‌جایی ↑/↓ با پرش از مخفی‌ها و ویجت‌های غیرحاضر (نقش دیگر)
// • dropWidget: جای‌گذاری کشیده‌شده کنار هدف — بدون تغییر بقیه‌ی ترتیب
// • loadLayout/saveLayout: ماندگاری per-user + امن بودن در برابر داده‌ی خراب
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ORDER,
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

/** defs کمکی برای applyLayout — همان یازده ویجت داشبورد با span دلخواه */
function defs(span: 'full' | 'half' = 'full') {
  return DEFAULT_ORDER.map((id) => ({ id, title: id, span }));
}
const ALL = new Set<string>(DEFAULT_ORDER);
const NONE_HIDDEN: string[] = [];

describe('normalizeLayout', () => {
  it('ورودی خالی/خراب → دقیقاً DEFAULT_ORDER بدون مخفی', () => {
    expect(normalizeLayout(null)).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
    expect(normalizeLayout(undefined)).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
    expect(normalizeLayout({})).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
    expect(normalizeLayout({ order: 'oops' as unknown as string[], hidden: 5 as unknown as string[] }))
      .toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
  });

  it('id ناشناخته/تکراری حذف و ویجت جامانده به‌ترتیب پیش‌فرض الحاق می‌شود', () => {
    const n = normalizeLayout({ order: ['stats', 'ghost', 'stats', 'trend'], hidden: ['ghost', 'stats'] });
    // stats و trend جلوتر می‌نشینند؛ بقیه به‌ترتیب پیش‌فرض بعدشان می‌آیند
    expect(n.order.slice(0, 2)).toEqual(['stats', 'trend']);
    expect(new Set(n.order)).toEqual(new Set(DEFAULT_ORDER));
    expect(n.order).toHaveLength(DEFAULT_ORDER.length);
    // مخفی فقط به شناخته‌شده‌ها محدود می‌شود
    expect(n.hidden).toEqual(['stats']);
  });

  it('defaultOrder کپی است — تغییرش DEFAULT_ORDER را آلوده نمی‌کند', () => {
    const d = defaultOrder();
    d.pop();
    expect(DEFAULT_ORDER).toHaveLength(11);
  });
});

describe('applyLayout', () => {
  it('بدون مخفی، همه به‌ترتیب order رندر می‌شوند', () => {
    const state = normalizeLayout(null);
    expect(applyLayout(defs(), state).map((d) => d.id)).toEqual([...DEFAULT_ORDER]);
  });

  it('ویجت مخفی حذف؛ ویجت ناشناخته (نقش دیگر) نادیده گرفته می‌شود', () => {
    const state = normalizeLayout({ order: [...DEFAULT_ORDER], hidden: ['backup', 'license'] });
    const out = applyLayout(defs(), state).map((d) => d.id);
    expect(out).not.toContain('backup');
    expect(out).not.toContain('license');
    // فقط همین دو حذف شدند
    expect(out).toHaveLength(DEFAULT_ORDER.length - 2);
  });

  it('ویجت موجودی که در order نیست (داده‌ی تازه) در انتها می‌نشیند', () => {
    const state = normalizeLayout({ order: ['stats'], hidden: [] });
    const out = applyLayout(defs(), state).map((d) => d.id);
    expect(out[0]).toBe('stats');
    expect(out).toHaveLength(DEFAULT_ORDER.length);
    expect(new Set(out)).toEqual(new Set(DEFAULT_ORDER));
  });
});

describe('moveWidget (کیبورد ↑/↓)', () => {
  it('جابه‌جایی ساده در میان قابل‌نمایش‌ها', () => {
    const moved = moveWidget(DEFAULT_ORDER, 'stats', 1, ALL, NONE_HIDDEN);
    expect(moved.indexOf('stats')).toBe(DEFAULT_ORDER.indexOf('progress'));
    expect(moved.indexOf('progress')).toBe(DEFAULT_ORDER.indexOf('stats'));
    expect(new Set(moved)).toEqual(new Set(DEFAULT_ORDER));
  });

  it('از روی ویجت مخفی «پرش» می‌کند — مخفی‌ها جابه‌جا نمی‌شوند', () => {
    const hidden = ['license'];
    const moved = moveWidget(DEFAULT_ORDER, 'stats', -1, ALL, hidden);
    // در نمایش واقعی (بدون مخفی‌ها) stats مستقیم بالای backup می‌نشیند
    const visible = moved.filter((id) => !hidden.includes(id));
    expect(visible.indexOf('stats')).toBe(visible.indexOf('backup') - 1);
    // و خودِ license (مخفی) سر جایش می‌ماند — جابه‌جایی از رویش «پرش» می‌کند
    expect(moved.indexOf('license')).toBe(DEFAULT_ORDER.indexOf('license'));
  });

  it('ویجت غیرحاضر (مثلاً بکاپ برای غیرادمین) مانع جابه‌جایی نمی‌شود', () => {
    const present = new Set(DEFAULT_ORDER.filter((id) => id !== 'backup' && id !== 'license'));
    const moved = moveWidget(DEFAULT_ORDER, 'stats', -1, present, NONE_HIDDEN);
    // با وجود غایب‌ها، ↑ همچنان یک گام به‌جلو در میان حاضرهاست
    expect(moved.indexOf('stats')).toBe(DEFAULT_ORDER.indexOf('welcome'));
    // هیچ غایبی جابه‌جا نشده
    expect(moved.indexOf('backup')).toBe(DEFAULT_ORDER.indexOf('backup'));
    expect(moved.indexOf('license')).toBe(DEFAULT_ORDER.indexOf('license'));
  });

  it('در مرز بالا/پایین ترتیب تغییر نمی‌کند', () => {
    expect(moveWidget(DEFAULT_ORDER, 'welcome', -1, ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
    expect(moveWidget(DEFAULT_ORDER, 'actions', 1, ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
  });

  it('ویجت مخفی/ناشناخته جابه‌جا نمی‌شود', () => {
    expect(moveWidget(DEFAULT_ORDER, 'backup', 1, ALL, ['backup'])).toEqual([...DEFAULT_ORDER]);
    expect(moveWidget(DEFAULT_ORDER, 'ghost', 1, ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
  });
});

describe('dropWidget (ری‌اکشن کشیدنی)', () => {
  it('ویجت کشیده‌شده کنار هدف می‌نشیند و بقیه‌ی ترتیب حفظ می‌شود', () => {
    const dropped = dropWidget(DEFAULT_ORDER, 'actions', 'welcome', ALL, NONE_HIDDEN);
    expect(dropped[0]).toBe('actions');
    expect(new Set(dropped)).toEqual(new Set(DEFAULT_ORDER));
    // بقیه به همان ترتیب می‌مانند (welcome جای‌اش را به actions می‌دهد و جلو می‌آید)
    expect(dropped.slice(1, 4)).toEqual(DEFAULT_ORDER.slice(0, 3));
  });

  it('ری‌اکشن روی خودش بی‌اثر است؛ هدف غایب/مخفی بی‌خطر است', () => {
    expect(dropWidget(DEFAULT_ORDER, 'stats', 'stats', ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
    expect(dropWidget(DEFAULT_ORDER, 'stats', 'ghost', ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
    expect(dropWidget(DEFAULT_ORDER, 'ghost', 'stats', ALL, NONE_HIDDEN)).toEqual([...DEFAULT_ORDER]);
    expect(dropWidget(DEFAULT_ORDER, 'stats', 'backup', ALL, ['backup'])).toEqual([...DEFAULT_ORDER]);
  });

  it('جابه‌جایی میان قابل‌نمایش‌هاست؛ مخفی‌ها سر جایشان می‌مانند', () => {
    const hidden = ['license'];
    const dropped = dropWidget(DEFAULT_ORDER, 'actions', 'welcome', ALL, hidden);
    expect(dropped[0]).toBe('actions');
    expect(dropped.indexOf('license')).toBe(DEFAULT_ORDER.indexOf('license'));
  });
});

describe('toggleHidden + ماندگاری localStorage', () => {
  it('toggle: افزودن و حذف بدون تکرار', () => {
    expect(toggleHidden([], 'stats')).toEqual(['stats']);
    expect(toggleHidden(['stats'], 'stats')).toEqual([]);
    expect(toggleHidden(['stats'], 'trend')).toEqual(['stats', 'trend']);
  });

  it('save → load چرخه‌ی کامل؛ کلید برای هر کاربر جداست', () => {
    const keyA = layoutKeyFor(1);
    const keyB = layoutKeyFor(2);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('user:1');

    const custom = normalizeLayout({ order: ['stats', ...DEFAULT_ORDER.filter((id) => id !== 'stats')], hidden: ['trend'] });
    saveLayout(keyA, custom);
    expect(loadLayout(keyA)).toEqual(custom);
    // کاربر دیگر چیدمان دست‌نخورده می‌بیند
    expect(loadLayout(keyB)).toEqual(normalizeLayout(null));
    localStorage.removeItem(keyA);
  });

  it('داده‌ی خراب/ناقص در storage → بی‌صدا پیش‌فرض', () => {
    const key = layoutKeyFor('corrupt-test');
    localStorage.setItem(key, '{not json!');
    expect(loadLayout(key)).toEqual(normalizeLayout(null));
    localStorage.setItem(key, JSON.stringify({ order: ['ghost'], hidden: ['nope'] }));
    expect(loadLayout(key)).toEqual(normalizeLayout(null));
    localStorage.removeItem(key);
  });
});
