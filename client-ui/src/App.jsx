import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PwaUpdate } from './components/PwaUpdate';
import { useOnline } from './hooks/useOnline';

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
  const { pathname, search } = useLocation();
  const online = useOnline();
  if (token || (!online && pathname === '/sandbox')) return children;
  if (!online) return <Navigate to="/offline" replace />;
  const share = pathname === '/lens' && new URLSearchParams(search).has('share');
  return <Navigate to="/auth" state={share ? { returnTo: pathname + search } : undefined} replace />;
}

function OfflinePage() {
  return (
    <main className="ct-workspace ct-offline-page">
      <header className="ct-workspace-header">
        <h1>ChessTrace offline</h1>
        <p>You can play through a position in Sandbox. Stockfish works offline after its first completed analysis online.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Link to="/sandbox" className="ct-button">Open Sandbox</Link>
        <Link to="/" className="ct-quiet">Back to home</Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PwaUpdate />
        <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Loading ChessTrace…</p>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/offline" element={<OfflinePage />} />
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
