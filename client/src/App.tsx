// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import ReportsPage from './pages/ReportsPage';
import ListsPage from './pages/ListsPage';
import UsersPage from './pages/UsersPage';
import CustomerViewPage from './pages/CustomerViewPage';

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
          <Route path="warranty" element={<WarrantyReplacePage />} />
          <Route path="warranty/replace" element={<WarrantyReplacePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="dashboard/customer/:id" element={<CustomerViewPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
