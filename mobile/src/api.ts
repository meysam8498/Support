// کلاینت API اپ موبایل — همان JWT وب؛ 401 → پاک‌سازی نشست و بازگشت به لاگین
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SERVER_URL, STORAGE_KEYS } from './config';

export interface ScanResponse {
  ok: boolean;
  found: boolean;
  match?: {
    kind: 'part' | 'device';
    part?: { id: number; title: string; part_number: string | null; serial: string | null; status: string };
    device?: { id: number; main_serial: string | null };
    project?: { id: number; name: string | null };
  };
  error?: string;
}

export async function getServerUrl(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.serverUrl)) ?? DEFAULT_SERVER_URL;
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.token);
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function login(serverUrl: string, username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; user?: unknown; error?: string };
  if (!res.ok || !data.token) {
    return { ok: false, error: data.error || `ورود ناموفق بود (خطای ${res.status}).` };
  }
  await AsyncStorage.setItem(STORAGE_KEYS.serverUrl, serverUrl.replace(/\/$/, ''));
  await AsyncStorage.setItem(STORAGE_KEYS.token, data.token);
  await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user ?? {}));
  return { ok: true };
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
}

/** ارسال یک اسکن — خروجی ساختار ScanResponse با ok=false در هر خطا (پیام فارسی در error) */
export async function sendScan(serial: string, projectId?: number): Promise<ScanResponse> {
  const serverUrl = await getServerUrl();
  const token = await getToken();
  if (!token) {
    return { ok: false, found: false, error: 'وارد نشده‌اید — دوباره وارد شوید.' };
  }
  try {
    const res = await fetch(`${serverUrl}/api/serial-import/mobile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ serial, project_id: projectId }),
    });
    if (res.status === 401) {
      await logout();
      return { ok: false, found: false, error: 'نشست منقضی است — دوباره وارد شوید.' };
    }
    const data = (await res.json().catch(() => ({}))) as ScanResponse;
    if (!res.ok) return { ok: false, found: false, error: data.error || `خطای ${res.status}` };
    return data;
  } catch {
    return { ok: false, found: false, error: 'ارتباط با سرور برقرار نشد — اسکن در صف آفلاین ذخیره شد.' };
  }
}
