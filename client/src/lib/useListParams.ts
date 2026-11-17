// ============================================================
// وضعیت فهرست در آدرس صفحه — یک منبع مشترک برای صفحه‌های فهرست
// سامانه‌ی مدیریت تجهیزات و قطعات یدکی — طراح: میثم ایجادی / Meysam Ijadi
// ----------------------------------------------------------------
// • صفحه/جست‌وجو/مرتب‌سازی در URL می‌نشینند: رفرش، دکمه‌ی بازگشت مرورگر و
//   لینک اشتراکی همان نما را باز می‌کنند.
// • تغییر هر فیلتر صفحه را به اول برمی‌گرداند و پارامتر خالی از آدرس حذف
//   می‌شود تا آدرس‌ها کوتاه بمانند.
// • ورودی جست‌وجو با ۳۰۰ms تأخیر نوشته می‌شود (هر کلید یک درخواست نیست).
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDir = 'asc' | 'desc';

export interface ListParams {
  /** شماره‌ی صفحه از ۰ */
  page: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: SortDir;
  /** مقدار خام یک پارامتر (مثلاً status/dup/catalog) */
  get: (key: string) => string;
  patch: (next: Record<string, string | undefined>) => void;
  goPage: (next: number) => void;
  toggleSort: (key: string) => void;
  /** ورودی جست‌وجوی صفحه (همگام با q) */
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** limit/offset + پارامترهای فعال — آماده برای fetch */
  queryString: (extra?: Record<string, string | undefined>) => string;
}

export function useListParams(pageSize = 50): ListParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(0, (Number(searchParams.get('page')) || 1) - 1);
  const q = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? '';
  const dir: SortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

  // مقدار خالی = حذف پارامتر؛ replace تا دکمه‌ی Back پر از ورودی‌های تایپ نشود
  const patch = useCallback(
    (next: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(next)) {
        if (!value) sp.delete(key);
        else sp.set(key, value);
      }
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const goPage = (next: number) => patch({ page: next > 0 ? String(next + 1) : undefined });

  /** کلیک اول صعودی، کلیک دوباره روی همان ستون نزولی، ستون دیگر از صعودی */
  const toggleSort = (key: string) =>
    patch({ sort: key, dir: sort === key && dir === 'asc' ? 'desc' : 'asc', page: undefined });

  const queryString = useCallback(
    (extra: Record<string, string | undefined> = {}) => {
      const sp = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      const values: Record<string, string | undefined> = { q, ...extra };
      for (const [key, value] of Object.entries(values)) if (value) sp.set(key, value);
      if (sort) {
        sp.set('sort', sort);
        sp.set('dir', dir);
      }
      return sp.toString();
    },
    [page, pageSize, q, sort, dir],
  );

  const [searchInput, setSearchInput] = useState(q);
  // بازگشت/جلو در مرورگر → ورودی با آدرس همگام شود
  useEffect(() => { setSearchInput(q); }, [q]);
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const timer = setTimeout(
      () => patch({ q: searchInput.trim() || undefined, page: undefined }),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchInput, q, patch]);

  return {
    page, pageSize, q, sort, dir, get, patch, goPage, toggleSort,
    searchInput, setSearchInput, queryString,
  };
}
