import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import OriginLens from './pages/OriginLens';
import Sandbox from './pages/Sandbox';
import TurningPoints from './pages/TurningPoints';
import PatternVault from './pages/PatternVault';
import VaultReview from './pages/VaultReview';
import Settings from './pages/Settings';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useServiceHealth } from './hooks/useServiceHealth';
import { API_BASE_URL } from './config/api';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) return <Navigate to="/" replace />;
  return children;
};

function AppContent() {
  const { status } = useServiceHealth(API_BASE_URL);

  return (
    <>
      {status === 'waking' && (
        <div className="bg-[#3b759e] text-white text-xs text-center py-1 fixed top-0 left-0 w-full z-50">
          Reconnecting to ChessTrace servers…
        </div>
      )}
      <div className={status === 'waking' ? 'pt-6' : ''}>
        <Routes>
          {/* Auth — standalone, no shell */}
          <Route path="/" element={<Auth />} />

          {/* App shell with sidebar */}
          <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/lens" element={<OriginLens />} />
            <Route path="/sandbox" element={<Sandbox />} />
            <Route path="/turning-points" element={<TurningPoints />} />
            <Route path="/vault" element={<PatternVault />} />
            <Route path="/vault/review" element={<VaultReview />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}