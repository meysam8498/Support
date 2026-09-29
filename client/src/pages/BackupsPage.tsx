// ============================================================
// صفحه‌ی مدیریتی بکاپ‌ها — فهرست + بکاپ دستی + دانلود + بازیابی دو مرحله‌ای
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ----------------------------------------------------------------
// • وضعیت زمان‌بند روزانه (ساعت، نگهداری، آخرین اجرا) + push خارجی/S3
// • بکاپ دستی فوری + دانلود فایل بکاپ (با توکن)
// • بازیابی دو مرحله‌ای: آماده‌سازی (بکاپ ایمنی + توکن) → تأیید نهایی (جایگزینی + ری‌استارت)
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api';
import { t } from '../i18n/fa';
import { toFa } from '../lib/date';
import { downloadAuthenticated } from '../lib/download';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

interface BackupInfo {
  file: string;
  sizeBytes: number;
  mtime: string;
}

interface BackupStatus {
  dir: string;
  keep: number;
  atHour: number;
  lastRun: string | null;
  lastResult: { ok: boolean; error?: string; push?: { ok: boolean; target: string; error?: string } } | null;
  count: number;
  push: { target: string; enabled: boolean; last: { ok: boolean; target: string; file?: string; error?: string; at?: string } | null };
}

interface RestorePrepareResult {
  ok: boolean;
  token?: string;
  file?: string;
  safetyBackup?: string;
  error?: string;
}

/** حجم خوانا — KB/MB */
function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${toFa(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  return `${toFa((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/** تاریخ/ساعت فایل بکاپ از نام (support-backup-YYYYMMDD-HHMMSS.db) — نمایش شمسی‌وار YYYY/MM/DD HH:MM */
function fmtStamp(fileName: string): string {
  const m = /support-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(fileName);
  if (!m) return fileName;
  return toFa(`${m[1]}/${m[2]}/${m[3]} — ${m[4]}:${m[5]}:${m[6]}`);
}

export default function BackupsPage() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [items, setItems] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // بازیابی دو مرحله‌ای
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreToken, setRestoreToken] = useState('');
  const [restoreSafety, setRestoreSafety] = useState('');
  const [restoreTyped, setRestoreTyped] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.get<BackupStatus & { items: BackupInfo[] }>('/backups');
      setStatus(s);
      setItems(s.items ?? []);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 6000); };

  const runNow = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ ok: boolean; sizeBytes?: number; push?: { ok: boolean; target: string; error?: string } }>('/backups/run', {});
      if (r.ok) {
        flash(`بکاپ دستی گرفته شد (${fmtSize(r.sizeBytes ?? 0)})${r.push && r.push.target ? (r.push.ok ? ` — push به مقصد خارجی موفق بود.` : ` — push خارجی ناموفق: ${r.push.error ?? '?'}`) : ''}.`);
        await load();
      } else {
        setError('بکاپ ناموفق بود.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (f: string) => {
    try {
      await downloadAuthenticated(`/backups/${f}`, f);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ---- مرحله‌ی ۱ بازیابی: آماده‌سازی (بکاپ ایمنی + توکن) ----
  const openRestore = async (info: BackupInfo) => {
    setRestoreTarget(info);
    setRestoreToken('');
    setRestoreSafety('');
    setRestoreTyped('');
    setBusy(true);
    setError('');
    try {
      const r = await api.post<RestorePrepareResult>('/backups/restore/prepare', { file: info.file });
      if (r.ok && r.token) {
        setRestoreToken(r.token);
        setRestoreSafety(r.safetyBackup ?? '');
        setRestoreConfirmOpen(true);
      } else {
        setError(r.error || 'آماده‌سازی بازیابی ناموفق بود.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- مرحله‌ی ۲ بازیابی: تأیید نهایی (جایگزینی + ری‌استارت سرور) ----
  const confirmRestoreFinal = async () => {
    if (!restoreTarget) return;
    setRestoreBusy(true);
    setError('');
    try {
      await api.post('/backups/restore/confirm', { token: restoreToken });
      // سرور پروسه را می‌بندد و کانتینر restart می‌شود؛ کاربر را آماده‌ی ورود مجدد کنیم
      setRestoreConfirmOpen(false);
      setError('');
      flash('بازیابی تأیید شد — سرور در حال ری‌استارت است؛ پس از چند ثانیه دوباره وارد شوید و داده‌ها را بررسی کنید.');
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          await fetch('/api/health');
          clearInterval(poll);
          window.location.href = '/login';
        } catch {
          if (tries > 40) clearInterval(poll);
        }
      }, 3000);
    } catch (e) {
      setError(`تأیید بازیابی ناموفق بود: ${(e as Error).message}`);
    } finally {
      setRestoreBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <p className="text-stone-500 dark:text-stone-400">دسترسی به مدیریت بکاپ‌ها فقط برای کارشناس مجاز (ادمین) امکان‌پذیر است.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-4">
      {/* ---------- هدر ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🗄️</span>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">مدیریت پشتیبان‌ها</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">بکاپ روزانه خودکار + بکاپ دستی + بازیابی با تأیید دو مرحله‌ای</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} className="btn-ghost !min-h-[34px] text-xs" title="به‌روزرسانی فهرست">⟳</button>
          <button type="button" onClick={runNow} disabled={busy} className="btn-primary !min-h-[34px] text-xs">
            {busy ? '...' : '🗄️ بکاپ دستی الان'}
          </button>
        </div>
      </div>

      {msg && (
        <p className="p-3 bg-green-50 dark:bg-green-900/25 text-success dark:text-green-300 rounded-lg text-sm border border-green-200 dark:border-green-800">
          {msg}
        </p>
      )}
      {error && (
        <p className="p-3 bg-coral/10 text-coral-dark rounded-lg text-sm border border-coral/30 dark:text-coral-light">
          {error}
        </p>
      )}

      {/* ---------- کارت وضعیت زمان‌بند + push ---------- */}
      <div className="card">
        <h2 className="text-sm font-bold text-stone-800 dark:text-stone-100 mb-2.5">وضعیت زمان‌بند خودکار</h2>
        {loading && !status ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">{t.loading}</p>
        ) : status ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-surface-raised dark:bg-stone-800/60 p-2.5">
              <p className="text-stone-400 dark:text-stone-500 mb-0.5">زمان‌بندی</p>
              <p className="font-bold fa-nums text-stone-700 dark:text-stone-200">هر روز ~ ساعت {toFa(String(status.atHour).padStart(2, '0'))}:۳۰</p>
            </div>
            <div className="rounded-lg bg-surface-raised dark:bg-stone-800/60 p-2.5">
              <p className="text-stone-400 dark:text-stone-500 mb-0.5">نگهداری</p>
              <p className="font-bold fa-nums text-stone-700 dark:text-stone-200">{toFa(status.keep)} نسخه‌ی آخر</p>
            </div>
            <div className="rounded-lg bg-surface-raised dark:bg-stone-800/60 p-2.5">
              <p className="text-stone-400 dark:text-stone-500 mb-0.5">آخرین اجرا</p>
              <p className="font-bold fa-nums text-stone-700 dark:text-stone-200" dir="ltr">
                {status.lastRun ? new Date(status.lastRun).toLocaleString('fa-IR-u-nu-latn', { timeZone: 'Asia/Tehran' }) : '—'}
              </p>
              {status.lastResult && !status.lastResult.ok && (
                <p className="text-coral-dark dark:text-coral-light mt-1">آخرین بکاپ ناموفق بود{status.lastResult.error ? `: ${status.lastResult.error}` : ''}</p>
              )}
            </div>
            <div className="rounded-lg bg-surface-raised dark:bg-stone-800/60 p-2.5">
              <p className="text-stone-400 dark:text-stone-500 mb-0.5">Push خارجی</p>
              {status.push.enabled ? (
                <>
                  <p className="font-bold text-stone-700 dark:text-stone-200 truncate" dir="ltr" title={status.push.target}>{status.push.target}</p>
                  {status.push.last && (
                    <p className={status.push.last.ok ? 'text-success mt-1' : 'text-coral-dark dark:text-coral-light mt-1'}>
                      {status.push.last.ok ? 'آخرین push موفق' : `آخرین push ناموفق: ${status.push.last.error ?? '?'}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-stone-500 dark:text-stone-400">غیرفعال (BACKUP_PUSH_TARGET تنظیم نشده)</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------- فهرست بکاپ‌ها ---------- */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-raised dark:bg-stone-800/80">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">فهرست بکاپ‌ها</h2>
          <span className="chip chip-default fa-nums text-xs">{toFa(items.length)} فایل</span>
        </div>
        {loading && items.length === 0 ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">{t.loading}</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-stone-400 dark:text-stone-500 text-sm">هنوز بکاپی گرفته نشده — با دکمه‌ی «بکاپ دستی الان» شروع کنید.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-card dark:bg-stone-800/60 text-stone-600 dark:text-stone-300 text-xs">
                  <th className="text-right px-4 py-2.5 font-semibold">زمان بکاپ</th>
                  <th className="text-right px-4 py-2.5 font-semibold">حجم</th>
                  <th className="text-center px-4 py-2.5 font-semibold">اقدام</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.file} className="border-t border-dashed border-stone-200 dark:border-stone-700 hover:bg-brand-50/40 dark:hover:bg-brand-900/15 transition-colors">
                    <td className="px-4 py-2.5 fa-nums text-stone-700 dark:text-stone-200">{fmtStamp(b.file)}</td>
                    <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">{fmtSize(b.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={() => download(b.file)} className="btn-ghost !min-h-[26px] !px-2 text-[11px]" title="دانلود فایل بکاپ">
                          ⬇ دانلود
                        </button>
                        <button
                          type="button"
                          onClick={() => openRestore(b)}
                          disabled={busy}
                          className="btn-ghost !min-h-[26px] !px-2 text-[11px] !text-coral-dark dark:!text-coral-light"
                          title="بازیابی این بکاپ (دو مرحله‌ای با تأیید)"
                        >
                          ♻️ بازیابی
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- دیالوگ تأیید نهایی بازیابی (مرحله‌ی ۲) ---------- */}
      <Modal open={restoreConfirmOpen} onClose={() => setRestoreConfirmOpen(false)} title="تأیید نهایی بازیابی دیتابیس">
        <div className="space-y-4">
          <p className="p-3 rounded-lg bg-coral/10 border border-coral/30 text-sm text-coral-dark dark:text-coral-light leading-6">
            ⚠️ دیتابیس فعلی به‌طور کامل با محتوای بکاپ انتخابی <b>جایگزین می‌شود</b>. هر داده‌ای که بعد از زمان این بکاپ ثبت شده از بین می‌رود
            (یک بکاپ ایمنی از وضعیت فعلی گرفته شده و در فهرست باقی می‌ماند). پس از تأیید، سرور ری‌استارت می‌شود و همه‌ی کاربران باید دوباره وارد شوند.
          </p>
          <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-3 text-sm space-y-1">
            <p><b>بکاپ بازیابی‌شونده:</b> <span className="fa-nums">{restoreTarget && fmtStamp(restoreTarget.file)}</span></p>
            <p><b>بکاپ ایمنی (وضعیت فعلی):</b> <span className="fa-nums">{restoreSafety && fmtStamp(restoreSafety)}</span></p>
          </div>
          <div>
            <label className="label">برای تأیید، عبارت <b className="fa-nums" dir="ltr">بازیابی</b> را تایپ کنید:</label>
            <input
              className="input"
              value={restoreTyped}
              onChange={(e) => setRestoreTyped(e.target.value)}
              placeholder="بازیابی"
              dir="rtl"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setRestoreConfirmOpen(false)} className="btn-secondary">انصراف</button>
            <button
              type="button"
              onClick={confirmRestoreFinal}
              disabled={restoreBusy || restoreTyped.trim() !== 'بازیابی'}
              className="btn-primary !bg-coral hover:!opacity-90"
            >
              {restoreBusy ? '...' : '♻️ تأیید و ری‌استارت سرور'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
