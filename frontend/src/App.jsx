import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SocketProvider } from "./context/SocketContext";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import VehiclesPage from "./pages/VehiclesPage";
import MapPage from "./pages/MapPage";
import TripsPage from "./pages/TripsPage";
import AlertsPage from "./pages/AlertsPage";
import VehicleDetail from "./pages/VehicleDetail";
import ZonesPage from "./pages/ZonesPage";
import AnalyticsPage from "./pages/AnalyticsPage";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <SocketProvider><Layout>{children}</Layout></SocketProvider>;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login"  element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />

          <Route path="/"               element={<Protected><DashboardPage /></Protected>} />
          <Route path="/map"            element={<Protected><MapPage /></Protected>} />
          <Route path="/vehicles"       element={<Protected><VehiclesPage /></Protected>} />
          <Route path="/vehicles/:id"   element={<Protected><VehicleDetail /></Protected>} />
          <Route path="/zones"          element={<Protected><ZonesPage /></Protected>} />
          <Route path="/trips"          element={<Protected><TripsPage /></Protected>} />
          <Route path="/alerts"         element={<Protected><AlertsPage /></Protected>} />
          <Route path="/analytics"      element={<Protected><AnalyticsPage /></Protected>} />

          {/* Legacy redirects so old bookmarks still work */}
          <Route path="/scooters"     element={<Navigate to="/vehicles" replace />} />
          <Route path="/scooters/:id" element={<Navigate to="/vehicles" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
