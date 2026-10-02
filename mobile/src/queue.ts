// صف آفلاین — اسکن‌های ثبت‌نشده در AsyncStorage می‌مانند و بعد از اتصال ارسال می‌شوند
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './config';

export interface QueuedScan {
  serial: string;
  project_id?: number;
  queued_at: string; // ISO
  attempts: number;
}

export async function loadQueue(): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.queue);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(items: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(items));
}

export async function enqueueScan(serial: string, projectId?: number): Promise<number> {
  const items = await loadQueue();
  items.push({ serial, project_id: projectId, queued_at: new Date().toISOString(), attempts: 0 });
  await saveQueue(items);
  return items.length;
}

/** حذف موارد داده‌شده از صف (پس از ثبت موفق — تطبیق با queued_at) */
export async function removeScans(done: QueuedScan[]): Promise<void> {
  const doneKeys = new Set(done.map((d) => d.queued_at));
  const items = await loadQueue();
  await saveQueue(items.filter((i) => !doneKeys.has(i.queued_at)));
}

/** افزایش شمارنده‌ی تلاش موارد ناموفق (برای backoff ساده) */
export async function markAttempts(items: QueuedScan[]): Promise<void> {
  const keys = new Set(items.map((i) => i.queued_at));
  const all = await loadQueue();
  await saveQueue(all.map((i) => (keys.has(i.queued_at) ? { ...i, attempts: i.attempts + 1 } : i)));
}

/**
 * همگام‌سازی صف — ارسال FIFO با fetch مستقیم (بدون api.ts تا وابستگی متقابل نشود).
 * خروجی: تعداد ثبت‌شده. خطای شبکه = توقف (مورد بعدی بعداً)؛ 4xx = رکورد خراب، حذف.
 */
export async function syncQueue(serverUrl: string, token: string): Promise<number> {
  const items = await loadQueue();
  if (items.length === 0) return 0;

  const sent: QueuedScan[] = [];
  const bad: QueuedScan[] = [];
  for (const item of items) {
    try {
      const res = await fetch(`${serverUrl}/api/serial-import/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ serial: item.serial, project_id: item.project_id }),
      });
      if (res.ok) {
        sent.push(item);
      } else if (res.status >= 400 && res.status < 500) {
        bad.push(item); // رکورد غیرقابل‌ثبات (مثلاً سریال خالی) — گیر نکند
      } else {
        break; // خطای سرور — بقیه برای دفعه‌ی بعد
      }
    } catch {
      break; // بدون شبکه — بقیه برای دفعه‌ی بعد
    }
  }
  await removeScans([...sent, ...bad]);
  const failed = items.filter((i) => !sent.includes(i) && !bad.includes(i));
  if (failed.length > 0) await markAttempts(failed);
  return sent.length;
}
