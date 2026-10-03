// ============================================================
// باکس جست‌وجوی سراسری — یک باکس، همه‌چیز (هدر برنامه)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • debounce ۳۰۰ms روی تایپ کاربر — هر ورودی یک درخواست /api/search
// • نتیجه گروه‌بندی‌شده (پروژه/تجهیز/قطعه/کارشناس/تعویض) با ناوبری مستقیم
// • هایلایت عبارت تطبیق‌یافته در برچسب/زیرنویس + خط ویژه‌ی «فیلد تطبیق‌یافته»
//   و خط متا (قرارداد، تاریخ‌ها، وضعیت) که سرور برای هر hit می‌فرستد
// • بستن با Escape، کلیک بیرون، یا ناوبری؛ Ctrl+K فوکوس می‌کند
// • درخواست قبلی abort می‌شود تا پاسخ‌های کهنه UI را خراب نکنند
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SearchHit {
  type: 'project' | 'device' | 'part' | 'expert' | 'replacement';
  id: number;
  label: string;
  sub: string;
  meta?: string;
  matched?: { field: string; value: string };
  link: string;
  badge: string;
}

interface SearchResponse {
  q: string;
  hits: SearchHit[];
  groups: { type: SearchHit['type']; title: string; count: number }[];
  empty: boolean;
  total?: number;
  page?: number;
  per_page?: number;
  has_more?: boolean;
  type_counts?: Partial<Record<SearchHit['type'], number>>;
}

const TYPE_ICONS: Record<SearchHit['type'], string> = {
  project: '📁',
  device: '🖥️',
  part: '🔩',
  expert: '👤',
  replacement: '🔄',
};

/** قطعه‌بندی متن برای هایلایت عبارت جست‌وجو (case-insensitive) */
function splitHighlight(text: string, term: string): { part: string; hit: boolean }[] {
  if (!term || !text) return [{ part: text, hit: false }];
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const out: { part: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) {
      out.push({ part: text.slice(i), hit: false });
      break;
    }
    if (at > i) out.push({ part: text.slice(i, at), hit: false });
    out.push({ part: text.slice(at, at + term.length), hit: true });
    i = at + term.length;
  }
  return out.length ? out : [{ part: text, hit: false }];
}

function Highlight({ text, term }: { text: string; term: string }) {
  const parts = splitHighlight(text, term);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-amber-200/70 dark:bg-amber-400/30 text-inherit rounded-[3px] px-0.5">
            {p.part}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.part}</React.Fragment>
        ),
      )}
    </>
  );
}

const TYPE_LABELS: Record<SearchHit['type'], string> = {
  project: 'پروژه',
  device: 'تجهیز',
  part: 'قطعه',
  expert: 'کارشناس',
  replacement: 'تعویض',
};

export default function GlobalSearchBox({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [typeFilter, setTypeFilter] = useState<SearchHit['type'] | ''>('');
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  // Ctrl+K / Ctrl+/ فوکوس
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // کلیک بیرون → بستن
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // debounce جست‌وجو — با تغییر فیلتر نوع هم دوباره جست‌وجو می‌شود
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const token = localStorage.getItem('token');
        const qs = new URLSearchParams({ q: term });
        if (typeFilter) qs.set('types', typeFilter);
        const res = await fetch(`/api/search?${qs.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: ctrl.signal,
        });
        if (res.status === 429) {
          setData({ q: term, hits: [], groups: [], empty: true });
          return;
        }
        const json = (await res.json()) as SearchResponse;
        setData(json);
        setOpen(true);
        setActiveIdx(-1);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setData({ q: term, hits: [], groups: [], empty: true });
        }
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, typeFilter]);

  const go = useCallback((link: string) => {
    setOpen(false);
    setQ('');
    setData(null);
    navigate(link);
  }, [navigate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!data || data.hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, data.hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      go(data.hits[activeIdx].link);
    }
  };

  const term = q.trim();

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (data) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={compact ? 'جست‌وجو… (Ctrl+K)' : 'جست‌وجو در سریال، پارت‌نامبر، پروژه، کارشناس و…'}
          className={`input pr-10 ${compact ? 'min-h-[36px] py-1.5' : ''}`}
          dir="auto"
        />
        {busy && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        )}
        {!q && !compact && (
          <kbd className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 border border-stone-300 dark:border-stone-600 rounded px-1.5 py-0.5 hidden sm:block">
            Ctrl+K
          </kbd>
        )}
      </div>

      {open && data && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-surface-card dark:bg-stone-800 shadow-lg max-h-[460px] overflow-y-auto">
          {/* چیپ‌های فیلتر نوع */}
          <div className="sticky top-0 z-10 bg-surface-card dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700 px-2.5 py-1.5 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={`chip px-2 py-0.5 text-[11px] ${!typeFilter ? 'chip-active' : 'chip-default opacity-70 hover:opacity-100'}`}
            >
              همه{data.type_counts ? ` (${toFa(Object.values(data.type_counts).reduce((a: number, b) => a + (b || 0), 0))})` : ''}
            </button>
            {(Object.keys(TYPE_LABELS) as SearchHit['type'][]).map((tp) => {
              const cnt = data.type_counts?.[tp] ?? 0;
              if (cnt === 0 && typeFilter !== tp) return null;
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTypeFilter(typeFilter === tp ? '' : tp)}
                  className={`chip px-2 py-0.5 text-[11px] ${typeFilter === tp ? 'chip-active' : 'chip-default opacity-70 hover:opacity-100'} ${cnt === 0 ? 'opacity-40' : ''}`}
                  title={`فقط ${TYPE_LABELS[tp]}`}
                >
                  {TYPE_ICONS[tp]} {TYPE_LABELS[tp]} ({toFa(cnt)})
                </button>
              );
            })}
          </div>
          {data.hits.length === 0 ? (
            <p className="p-4 text-sm text-stone-500 dark:text-stone-400 text-center">
              نتیجه‌ای برای «{data.q}»{typeFilter ? ` در ${TYPE_LABELS[typeFilter]}` : ''} پیدا نشد.
            </p>
          ) : (
            <div className="py-1">
              {data.groups.map((g) => (
                <div key={g.type}>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-bold text-stone-500 dark:text-stone-400 flex items-center gap-2">
                    <span>{TYPE_ICONS[g.type]}</span>
                    {g.title}
                    <span className="chip chip-default px-2 py-0 text-[10px]">{toFa(g.count)}</span>
                  </p>
                  {data.hits.filter((h) => h.type === g.type).map((h) => {
                    const idx = data.hits.indexOf(h);
                    return (
                      <button
                        key={`${h.type}-${h.id}`}
                        type="button"
                        onClick={() => go(h.link)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`w-full text-right px-3 py-2 flex items-start gap-2.5 transition-colors ${
                          idx === activeIdx
                            ? 'bg-brand-50 dark:bg-brand-900/30'
                            : 'hover:bg-surface-raised dark:hover:bg-stone-700/60'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">{TYPE_ICONS[h.type]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate" dir="auto">
                            <Highlight text={h.label} term={term} />
                          </span>
                          {h.sub && (
                            <span className="block text-xs text-stone-500 dark:text-stone-400 truncate" dir="auto">
                              <Highlight text={h.sub} term={term} />
                            </span>
                          )}
                          {h.matched && h.matched.value && h.matched.value !== h.label && (
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-brand-700 dark:text-brand-300 truncate" dir="auto">
                              <span className="shrink-0 opacity-70">{h.matched.field}:</span>
                              <span className="truncate">
                                <Highlight text={h.matched.value} term={term} />
                              </span>
                            </span>
                          )}
                          {h.meta && (
                            <span className="mt-0.5 block text-[11px] text-stone-400 dark:text-stone-500 truncate" dir="auto">
                              {h.meta}
                            </span>
                          )}
                        </span>
                        <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300 shrink-0 mt-0.5">
                          {h.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {data.per_page === 0 && data.total !== undefined && data.total > data.hits.length && (
                <p className="px-3 py-2 text-[11px] text-stone-400 dark:text-stone-500 text-center fa-nums">
                  {toFa(data.hits.length)} از {toFa(data.total)} نتیجه — برای فهرست کامل‌تر، فیلتر نوع را بالا انتخاب کنید
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** اعداد فارسی — بدون وابستگی به lib/date برای همین کامپوننت */
function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
