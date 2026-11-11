import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import { AuthProvider, useAuth } from './context/AuthContext';

const Shell = lazy(() => import('./components/Shell').then(({ Shell: Component }) => ({ default: Component })));
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OriginLens = lazy(() => import('./pages/OriginLens'));
const Sandbox = lazy(() => import('./pages/Sandbox'));
const TurningPoints = lazy(() => import('./pages/TurningPoints'));
const PatternVault = lazy(() => import('./pages/PatternVault'));
const VaultReview = lazy(() => import('./pages/VaultReview'));
const Settings = lazy(() => import('./pages/Settings'));

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Loading ChessTrace…</p>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/lens" element={<OriginLens />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/turning-points" element={<TurningPoints />} />
              <Route path="/vault" element={<PatternVault />} />
              <Route path="/vault/review" element={<VaultReview />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
