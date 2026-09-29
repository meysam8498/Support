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
import WarrantyReplacePage from './pages/WarrantyReplacePage';
import ReplacementsListPage from './pages/ReplacementsListPage';
import PartsGridEditor from './pages/PartsGridEditor';
import ReportsPage from './pages/ReportsPage';
import ListsPage from './pages/ListsPage';
import UsersPage from './pages/UsersPage';
import CustomerViewPage from './pages/CustomerViewPage';
import SerialImportPage from './pages/SerialImportPage';
import BackupsPage from './pages/BackupsPage';
import LicensePage from './pages/LicensePage';

/** روتر کمکی گرید قطعات: داده‌ی تجهیز را می‌گیرد و PartsGridEditor را رندر می‌کند */
function PartsGridRouter() {
  const { id } = useParams();
  const [device, setDevice] = React.useState<import('./api/api').Device | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    (async () => {
      try {
        const d = await import('./api/api').then((m) => m.api.get<{ device: import('./api/api').Device }>(`/devices/${id}`));
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
          <Route path="dashboard/customer/:id" element={<CustomerViewPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
