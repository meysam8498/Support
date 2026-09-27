/**
 * دانلود فایل از API با توکن احراز هویت.
 * لینک <a href> ساده توکن ندارد (۴۰۱ می‌دهد)؛ پس با fetch و Blob دانلود می‌کنیم.
 * نام فایل از هدر Content-Disposition استخراج می‌شود (در نبودش، fallback).
 */
export async function downloadAuthenticated(path: string, fallbackName: string): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `خطای ${res.status}`);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  const fileName = m ? m[1] : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
