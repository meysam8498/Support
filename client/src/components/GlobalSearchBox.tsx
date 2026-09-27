// ============================================================
// باکس جست‌وجوی سراسری — یک باکس، همه‌چیز (داشبورد)
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • debounce ۳۰۰ms روی تایپ کاربر — هر ورودی یک درخواست /api/search
// • نتیجه گروه‌بندی‌شده (پروژه/تجهیز/قطعه/کارشناس/تعویض) با ناوبری مستقیم
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
  link: string;
  badge: string;
}

interface SearchResponse {
  q: string;
  hits: SearchHit[];
  groups: { type: SearchHit['type']; title: string; count: number }[];
  empty: boolean;
}

const TYPE_ICONS: Record<SearchHit['type'], string> = {
  project: '📁',
  device: '🖥️',
  part: '🔩',
  expert: '👤',
  replacement: '🔄',
};

export default function GlobalSearchBox({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
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

  // debounce جست‌وجو
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
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
  }, [q]);

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
          className={`input !pr-10 ${compact ? '!min-h-[36px] !py-1.5' : ''}`}
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
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-surface-card dark:bg-stone-800 shadow-lg max-h-[420px] overflow-y-auto">
          {data.hits.length === 0 ? (
            <p className="p-4 text-sm text-stone-500 dark:text-stone-400 text-center">
              نتیجه‌ای برای «{data.q}» پیدا نشد.
            </p>
          ) : (
            <div className="py-1">
              {data.groups.map((g) => (
                <div key={g.type}>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-bold text-stone-500 dark:text-stone-400 flex items-center gap-2">
                    <span>{TYPE_ICONS[g.type]}</span>
                    {g.title}
                    <span className="chip chip-default !px-2 !py-0 text-[10px]">{toFa(g.count)}</span>
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
                            {h.label}
                          </span>
                          {h.sub && (
                            <span className="block text-xs text-stone-500 dark:text-stone-400 truncate" dir="auto">
                              {h.sub}
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
