import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import DriverLayout from './layouts/DriverLayout';
import DashboardPage from './pages/admin/DashboardPage';
import DriversPage from './pages/admin/DriversPage';
import AddDriverPage from './pages/admin/AddDriverPage';
import ClientsPage from './pages/admin/ClientsPage';
import AddClientPage from './pages/admin/AddClientPage';
import DeliveriesPage from './pages/admin/DeliveriesPage';
import InvoicesPage from './pages/admin/InvoicesPage';
import MonthlyBillingPage from './pages/admin/MonthlyBillingPage';
import InventoryPage from './pages/admin/InventoryPage';
import ReportsPage from './pages/admin/ReportsPage';
import DriverDashboardPage from './pages/driver/DriverDashboardPage';
import DriverSummaryPage from './pages/driver/DriverSummaryPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: '14px' },
            success: { duration: 3000 },
            error: { duration: 5000 },
          }}
        />
        <Routes>
          {/* Root → dashboard directly */}
          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="ADMIN">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="drivers/new" element={<AddDriverPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/new" element={<AddClientPage />} />
            <Route path="deliveries" element={<DeliveriesPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="billing"    element={<MonthlyBillingPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports"   element={<ReportsPage />} />
          </Route>

          {/* Driver */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute role="DRIVER">
                <DriverLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/driver/dashboard" replace />} />
            <Route path="dashboard" element={<DriverDashboardPage />} />
            <Route path="summary" element={<DriverSummaryPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
