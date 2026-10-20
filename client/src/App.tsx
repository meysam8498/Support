// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceFormPage from './pages/DeviceFormPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import PartsPage from './pages/PartsPage';
import PartFormPage from './pages/PartFormPage';
import PartDetailPage from './pages/PartDetailPage';
import ReplacementsListPage from './pages/ReplacementsListPage';
import ListsPage from './pages/ListsPage';
import UsersPage from './pages/UsersPage';
import CustomerViewPage from './pages/CustomerViewPage';
import LicensePage from './pages/LicensePage';
import AboutPage from './pages/AboutPage';
import {
  ReportsPage,
  SerialImportPage,
  LogViewerPage,
  IssuePage,
  PartsGridEditor,
  BackupsPage,
  WarrantyReplacePage,
} from './pages/registry';
import { api, type Device } from './api/api';

// صفحات سنگین از pages/registry.ts می‌آیند (React.lazy آن‌جا تعریف شده) تا:
//   • چانک اولیه (index) سبک بماند و هر صفحه فقط هنگام ورود دانلود شود
//   • prefetch روی hover منو (Layout) از همان import استفاده کند → ورود بی‌مکث
// بودجه‌ی هر چانک جداشده را scripts/check-bundle-budget.mjs می‌سنجد.

/** روتر کمکی گرید قطعات: داده‌ی تجهیز را می‌گیرد و PartsGridEditor را رندر می‌کند */
function PartsGridRouter() {
  const { id } = useParams();
  const [device, setDevice] = React.useState<Device | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    (async () => {
      try {
        // import ایستا: import پویای قبلی بی‌اثر بود (api.ts از ۲۷ جا ایستا وارد می‌شود)
        // و Vite هشدار INEFFECTIVE_DYNAMIC_IMPORT می‌داد — هیچ چانک جدا نمی‌شد.
        // چانک‌بندی واقعی api.ts حالا با manualChunks در vite.config انجام می‌شود.
        const d = await api.get<{ device: Device }>(`/devices/${id}`);
        setDevice(d.device);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);
  if (error) return <p className="p-8 text-center text-coral">{error}</p>;
  if (!device) return <p className="p-8 text-center text-stone-400">در حال بارگذاری…</p>;
  return (
    <PartsGridEditor
      deviceId={device.id}
      deviceSerial={device.main_serial}
      defaultSoldAt={device.sold_at_jalali || ''}
    />
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

/**
 * درخت مسیرها — جدا از BrowserRouter تا تست‌ها (tst/a11y) همان مسیرها را
 * داخل MemoryRouter با shell واقعی (Layout) رندر کنند.
 */
export function AppRoutes() {
  return (
    <React.Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<DashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="devices/new" element={<DeviceFormPage />} />
          <Route path="devices/:id" element={<DeviceDetailPage />} />
          <Route path="devices/:id/edit" element={<DeviceFormPage />} />
          <Route path="parts" element={<PartsPage />} />
          <Route path="parts/new" element={<PartFormPage />} />
          <Route path="parts/:id" element={<PartDetailPage />} />
          <Route path="parts/:id/edit" element={<PartFormPage />} />
          <Route path="devices/:id/parts-grid" element={<PartsGridRouter />} />
          <Route path="warranty" element={<ReplacementsListPage />} />
          <Route path="warranty/replace" element={<WarrantyReplacePage />} />
          <Route path="warranty/replacements" element={<ReplacementsListPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="serial-import" element={<SerialImportPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="backups" element={<BackupsPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="issue" element={<IssuePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="logs" element={<LogViewerPage />} />
          <Route path="dashboard/customer/:id" element={<CustomerViewPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}

/** فالبک بارگذاری صفحات lazy — برای به‌روزرسانی‌های زنده (role=status) هم خوانا است */
function PageLoading() {
  return (
    <div className="p-8 text-center text-stone-400" role="status" data-testid="page-loading">
      در حال بارگذاری…
    </div>
  );
}
