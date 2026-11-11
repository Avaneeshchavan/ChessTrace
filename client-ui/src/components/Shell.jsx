import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Eye, Grid3x3, Home, LogOut, Menu, Settings, TrendingUp, X, Zap } from 'lucide-react';
import ChessTraceLogo from './ChessTraceLogo';
import { useAuth } from '../context/AuthContext';
import { useServiceHealth } from '../hooks/useServiceHealth';
import { API_BASE_URL } from '../config/api';

const navItems = [
  ['/dashboard', 'Dashboard', Home],
  ['/lens', 'Origin Lens', Eye],
  ['/sandbox', 'Sandbox', Zap],
  ['/turning-points', 'Turning Points', TrendingUp],
  ['/vault', 'Pattern Vault', Grid3x3],
  ['/settings', 'Settings', Settings],
];

export function Shell() {
  const { logout } = useAuth();
  const { status } = useServiceHealth(API_BASE_URL);
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === pathname;

  return (
    <div className="study-shell">
      <a href="#study-main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <aside className="study-sidebar" data-menu-open={menuOpen}
        onKeyDown={event => { if (event.key === 'Escape') setMenuPath(null); }}>
        <Link to="/dashboard" className="study-brand" onClick={() => setMenuPath(null)}><ChessTraceLogo /></Link>
        <button type="button" className="study-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen} aria-controls="study-navigation" onClick={() => setMenuPath(menuOpen ? null : pathname)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="study-navigation flex min-h-0 flex-1 flex-col" id="study-navigation">
          <nav className="study-nav" aria-label="Study navigation">
            {navItems.map(([to, label, Icon]) => (
              <NavLink key={to} to={to} onClick={() => setMenuPath(null)}>
                <Icon size={17} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={logout} className="study-logout"><LogOut size={17} aria-hidden="true" /> Sign out</button>
        </div>
      </aside>
      <div className="study-content" id="study-main" tabIndex={-1}>
        {status === 'waking' && <p role="status" className="study-health">Reconnecting to the game database…</p>}
        <Outlet />
      </div>
    </div>
  );
}
