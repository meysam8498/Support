/**
 * کلاینت API — ارتباط با بک‌اند
 */

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

/** خروج: پاک‌کردن نشست و هدایت به صفحه‌ی ورود (برای پاسخ 401 درخواست‌های عادی). */
function clearSessionAndRedirect(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 فقط برای درخواست‌های عادی یعنی «نشست منقضی»؛
 // (لاگین 401 اختصاصی خودش را در loginRequest مدیریت می‌کند.)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearSessionAndRedirect();
    throw new Error('نشست منقضی است؛ دوباره وارد شوید.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // بدنه‌ی خطا (مثل conflict در 409) به Error می‌چسبد تا فراخوان‌ها بتوانند تصمیم بگیرند
    const err = new Error(data.error || `خطای ${res.status}`) as Error & { payload?: unknown; status?: number };
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/**
 * ورود: مثل request ولی 401 اینجا یعنی «اعتبارنامه نادرست» و نباید نشست را پاک
 * کند یا ریدایرکت شود (باگ قبلی: نمایش پیام اشتباه «نشست منقضی است» به‌جای
 * «نام کاربری یا رمز عبور نادرست است» هنگام رمز اشتباه).
 */
export async function loginRequest(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطای ${res.status}`);
  return data as { token: string; user: User };
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** قطعات فعال یک دستگاه (برای جریان تعویض گارنتی). */
  getDeviceActiveParts: (deviceId: number) =>
    request<Part[]>('GET', `/parts?device=${deviceId}&status=active`),
  /** ورود با مدیریت خطای اختصاصی (نمایش پیام واقعی سرور در صفحه‌ی لاگین). */
  login: (username: string, password: string) => loginRequest(username, password),
};

// -------- نوع‌ها --------

export type Role = 'admin' | 'warehouse' | 'sales' | 'tech' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدیر سیستم',
  warehouse: 'انباردار',
  sales: 'کارشناس فروش',
  tech: 'کارشناس فنی',
  viewer: 'فقط‌مشاهده',
};

export interface User {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  role: Role;
  active?: number;
  created_at?: string;
}

export interface SelectItem {
  id: number;
  name: string;
  phone?: string;
  active?: number;
}

export interface DeviceModel {
  id: number;
  name: string;
  brand_id: number;
  brand_name?: string;
}

export interface Project {
  id: number;
  name: string;
  contract_number?: string;
  sales_expert_id?: number;
  sales_expert_name?: string;
}

export type DeviceStatus = 'active' | 'defective' | 'replacing' | 'replaced';
export type ReplacementReasonType = 'hardware' | 'software' | 'other';

export interface Device {
  id: number;
  project_id: number;
  project_name?: string;
  contract_number?: string;
  sales_expert_id?: number;
  sales_expert_name?: string;
  main_serial?: string;
  part_number_1?: string;
  part_number_2?: string;
  device_type_id: number;
  device_type_name?: string;
  device_model_id?: number;
  device_model_name?: string;
  brand_id?: number;
  brand_name?: string;
  technical_expert_id?: number;
  technical_expert_name?: string;
  description?: string;
  // تاریخ خروج از انبار
  warehouse_exit_jalali?: string;
  warehouse_exit_gregorian?: string;
  // تاریخ تحویل به مشتری
  customer_delivery_jalali?: string;
  customer_delivery_gregorian?: string;
  // گارانتی
  warranty_duration_months?: number;
  warranty_start_jalali?: string;
  warranty_start_gregorian?: string;
  warranty_end_jalali?: string;
  warranty_end_gregorian?: string;
  // وضعیت و دلایل تعویض
  status?: DeviceStatus;
  replacement_reason_type?: ReplacementReasonType;
  replacement_reason_desc?: string;
  // تاریخ فروش (قدیمی)
  sold_at_jalali?: string;
  sold_at_gregorian?: string;
  created_at?: string;
  parts_count?: number;
  replacements_count?: number;
  warranty_requests_count?: number;
}

export interface Part {
  id: number;
  device_id: number;
  title: string;
  tech_specs?: string;
  part_number_1?: string;
  part_number_2?: string;
  part_serial_number?: string;
  status: 'active' | 'replaced' | 'defective';
  sold_at_jalali?: string;
  sold_at_gregorian?: string;
  replaces_part_id?: number;
  created_at?: string;
  device_serial?: string;
  device_type_name?: string;
  brand_name?: string;
  project_name?: string;
}

export interface Replacement {
  id: number;
  device_id: number;
  old_part_id: number;
  new_part_id: number;
  old_part_title?: string;
  old_part_serial?: string;
  new_part_title?: string;
  new_part_serial?: string;
  replaced_by_expert_id?: number;
  expert_name?: string;
  failure_reason_id?: number;
  failure_reason_name?: string;
  description?: string;
  replaced_at_jalali: string;
  replaced_at_gregorian: string;
  device_serial?: string;
  project_name?: string;
}

export interface Lists {
  salesExperts: SelectItem[];
  technicalExperts: SelectItem[];
  brands: SelectItem[];
  deviceTypes: SelectItem[];
  deviceModels: DeviceModel[];
  projects: Project[];
  failureReasons: SelectItem[];
}

export interface DashboardStats {
  devices: number;
  parts: number;
  activeParts: number;
  replacements: number;
  projects: number;
}

export interface ReportSummary {
  totalReplacements: number;
  totalParts: number;
  replacedParts: number;
  activeParts: number;
  customersWithClaims: number;
  recentReplacements: { replaced_at_jalali: string; part_title?: string; project_name?: string }[];
}

// -------- انواع جدید: درخواست گارانتی + تأمین قطعات --------

export type WarrantyRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface WarrantyRequest {
  id: number;
  device_id: number;
  device_serial?: string;
  device_type_name?: string;
  project_name?: string;
  description?: string;
  status: WarrantyRequestStatus;
  request_jalali?: string;
  request_gregorian?: string;
  created_at?: string;
  created_by_name?: string;
}

export type ProcurementSource = 'internal' | 'external';

export interface Procurement {
  id: number;
  part_id: number;
  part_title?: string;
  part_serial?: string;
  device_serial?: string;
  project_name?: string;
  source: ProcurementSource;
  source_detail?: string;
  purchase_jalali?: string;
  purchase_gregorian?: string;
  supplier_warranty_months?: number;
  extra_notes?: string;
  created_at?: string;
}