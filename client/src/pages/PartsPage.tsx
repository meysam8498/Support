// ============================================================
// فهرست قطعات — سیستم طراحی Flip7
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// قابلیت ضدتکرار: قطعاتی که «پارت‌نامبر یکسان» دارند با نشان «تکراری»
// گروه نمایش داده می‌شوند و می‌توان توضیح درست را برای همه انتخاب کرد
// (به‌روزرسانی گروهی tech_specs — بدون حذف داده).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Part } from '../api/api';
import { t } from '../i18n/fa';
import { formatJalaliLong, toFa } from '../lib/date';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export default function PartsPage() {
  const { isAdmin } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dupOnly, setDupOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [descDialog, setDescDialog] = useState<{ pn: string; group: Part[] } | null>(null);

  const load = async () => {
    try {
      setParts(await api.get<Part[]>('/parts'));
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // گروه‌بندی بر اساس پارت‌نامبر نرمال‌شده برای پیدا کردن تکراری‌ها
  const pnGroups = useMemo(() => {
    const g = new Map<string, Part[]>();
    for (const p of parts) {
      const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
      if (!pn) continue;
      if (!g.has(pn)) g.set(pn, []);
      g.get(pn)!.push(p);
    }
    return g;
  }, [parts]);

  const dupPns = useMemo(
    () => new Set([...pnGroups.entries()].filter(([, arr]) => arr.length > 1).map(([pn]) => pn)),
    [pnGroups]
  );

  const filtered = parts.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
    if (dupOnly && !dupPns.has(pn)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.part_number_1 || '').toLowerCase().includes(q) ||
      (p.part_serial_number || '').toLowerCase().includes(q) ||
      (p.project_name || '').toLowerCase().includes(q)
    );
  });

  if (loading)
    return <p className="text-brand-300 text-center mt-20 dark:text-brand-400">{t.loading}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔩</span>
          <h1 className="text-xl font-extrabold text-brand-800 dark:text-brand-100">فهرست قطعات</h1>
        </div>
        {isAdmin && (
          <Link to="/parts/new" className="btn-primary text-sm">
            {t.addPart}
          </Link>
        )}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <input
          className="input max-w-md"
          placeholder={t.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">همه‌ی وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="replaced">تعویض‌شده</option>
          <option value="defective">معیوب</option>
        </select>
        {dupPns.size > 0 && (
          <label className="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dupOnly}
              onChange={(e) => setDupOnly(e.target.checked)}
              className="w-4 h-4 accent-[#2BA8A2]"
            />
            فقط تکراری‌ها ({toFa(dupPns.size)} پارت‌نامبر)
          </label>
        )}
      </div>

      {dupPns.size > 0 && !dupOnly && (
        <div className="rounded-2xl bg-gold/10 border-2 border-gold/40 px-4 py-3 text-sm text-[#8a6d00] dark:text-gold-light">
          ⚠ {toFa(dupPns.size)} پارت‌نامبر با بیش از یک رکورد یافت شد — با فیلتر «فقط تکراری‌ها» بررسی و
          توضیح درست را انتخاب کنید.
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-brand-300 dark:text-brand-400 text-center py-12">{t.noData}</p>
      ) : (
        <div className="overflow-x-auto card !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200 border-b-2 border-dashed border-brand-100 dark:border-brand-800">
                <th className="text-right px-3 py-3 font-bold">{t.partTitle}</th>
                <th className="text-right px-3 py-3 font-bold">{t.partNumber1}</th>
                <th className="text-right px-3 py-3 font-bold">{t.partSerial}</th>
                <th className="text-right px-3 py-3 font-bold">مشخصات فنی</th>
                <th className="text-right px-3 py-3 font-bold">پروژه</th>
                <th className="text-right px-3 py-3 font-bold">دستگاه</th>
                <th className="text-right px-3 py-3 font-bold">{t.status}</th>
                <th className="text-right px-3 py-3 font-bold">تاریخ فروش</th>
                {isAdmin && dupPns.size > 0 && <th className="text-right px-3 py-3 font-bold"> </th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pn = (p.part_number_1 || p.part_number_2 || '').replace(/\s+/g, '').toUpperCase();
                const isDup = dupPns.has(pn);
                const multiDesc = isDup && pnGroups.get(pn)!.some((x) => x.tech_specs && x.tech_specs !== p.tech_specs);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-dashed border-brand-50 dark:border-brand-900 hover:bg-brand-50/60 dark:hover:bg-brand-900/30 ${
                      isDup ? 'bg-gold/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/parts/${p.id}`}
                        className="text-brand-600 dark:text-brand-300 hover:underline font-bold"
                      >
                        {p.title}
                      </Link>
                      {isDup && (
                        <span
                          className="badge bg-coral/10 text-coral-dark border border-coral/40 mr-2 dark:text-coral-light"
                          title="پارت‌نامبر تکراری"
                        >
                          تکراری
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 fa-nums text-brand-700 dark:text-brand-200" dir="ltr">
                      {p.part_number_1 || '—'}
                    </td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">
                      {p.part_serial_number || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[220px]">
                      <span className={multiDesc ? 'text-coral-dark dark:text-coral-light' : ''}>
                        {p.tech_specs || '—'}
                      </span>
                      {multiDesc && <span className="text-coral-dark dark:text-coral-light"> ⚠</span>}
                    </td>
                    <td className="px-3 py-2">{p.project_name || '—'}</td>
                    <td className="px-3 py-2 fa-nums" dir="ltr">
                      {p.device_serial || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-brand-400 dark:text-brand-300/70">
                      {formatJalaliLong(p.sold_at_jalali)}
                    </td>
                    {isAdmin && dupPns.size > 0 && (
                      <td className="px-3 py-2">
                        {isDup && (
                          <button
                            onClick={() => setDescDialog({ pn, group: pnGroups.get(pn)! })}
                            className="btn-secondary !min-h-[32px] !px-3 text-xs"
                          >
                            انتخاب توضیح
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {descDialog && (
        <DescDialog
          pn={descDialog.pn}
          group={descDialog.group}
          onClose={() => setDescDialog(null)}
          onSaved={() => {
            setDescDialog(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** دیالوگ انتخاب توضیح درست برای گروه پارت‌های هم‌پارت‌نامبر */
function DescDialog({
  pn,
  group,
  onClose,
  onSaved,
}: {
  pn: string;
  group: Part[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // توضیحات متمایز موجود در گروه
  const variants = useMemo(() => {
    const set = new Set<string>();
    for (const p of group) if (p.tech_specs?.trim()) set.add(p.tech_specs.trim());
    return [...set];
  }, [group]);

  const [choice, setChoice] = useState<string>(variants[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      // همه‌ی قطعات گروه به توضیح انتخابی به‌روزرسانی می‌شوند (بدون حذف رکورد)
      await Promise.all(group.map((p) => api.put(`/parts/${p.id}`, { tech_specs: choice })));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="card max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b-2 border-dashed border-brand-100 dark:border-brand-800 pb-3">
          <span className="text-2xl">🧩</span>
          <h2 className="font-extrabold text-brand-800 dark:text-brand-100">
            انتخاب توضیح درست — پارت‌نامبر <span dir="ltr">{pn}</span>
          </h2>
        </div>

        <p className="text-sm text-brand-600 dark:text-brand-300">
          {toFa(group.length)} رکورد با این پارت‌نامبر وجود دارد. یک توضیح انتخاب کنید تا برای
          <b> همه‌ی رکوردها </b>اعمال شود (رکوردی حذف نمی‌شود).
        </p>

        <div className="space-y-2">
          {variants.length === 0 && <p className="text-sm text-brand-400">توضیحی ثبت نشده است.</p>}
          {variants.map((v) => (
            <label
              key={v}
              className={`flex items-start gap-2 rounded-2xl border-2 px-3 py-2 text-sm cursor-pointer transition ${
                choice === v
                  ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/50'
                  : 'border-brand-100 hover:border-brand-300 dark:border-brand-800'
              }`}
            >
              <input
                type="radio"
                name="desc"
                checked={choice === v}
                onChange={() => setChoice(v)}
                className="mt-1 accent-[#2BA8A2]"
              />
              <span className="text-brand-800 dark:text-brand-100">{v}</span>
              <span className="text-xs text-brand-400 dark:text-brand-300/70 mr-auto shrink-0">
                ({toFa(group.filter((p) => p.tech_specs?.trim() === v).length)} رکورد)
              </span>
            </label>
          ))}
        </div>

        {error && (
          <p className="p-2 bg-coral/10 text-coral-dark rounded-xl text-sm border border-coral/30 dark:text-coral-light">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">
            {t.cancel}
          </button>
          <button onClick={apply} disabled={busy || !choice} className="btn-primary text-sm">
            {busy ? '...' : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
