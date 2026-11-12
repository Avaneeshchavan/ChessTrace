import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Ellipsis, Eye, Grid3x3, Home, LogOut, Menu, Settings, TrendingUp, UserRound, X, Zap } from 'lucide-react';
import ChessTraceLogo from './ChessTraceLogo';
import { useAuth } from '../context/AuthContext';
import ServiceHealthBanner from './ServiceHealthBanner';
import { API_BASE_URL } from '../config/api';
import { useOnline } from '../hooks/useOnline';

const navItems = [
  ['/dashboard', 'Dashboard', Home],
  ['/lens', 'Origin Lens', Eye],
  ['/sandbox', 'Sandbox', Zap],
  ['/turning-points', 'Turning Points', TrendingUp],
  ['/vault', 'Pattern Vault', Grid3x3],
  ['/settings', 'Settings', Settings],
];
const mobileItems = [
  ['/lens', 'Lens', Eye],
  ['/sandbox', 'Sandbox', Zap],
  ['/vault', 'Vault', Grid3x3],
  ['/settings', 'Profile', UserRound],
];

export function Shell() {
  const { logout, token } = useAuth();
  const online = useOnline();
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === pathname;
  const sheet = useRef(null);
  const closeSheet = () => sheet.current?.close();

  useEffect(() => {
    const desktop = matchMedia('(min-width: 768px)');
    const closeOnResize = event => { if (event.matches) closeSheet(); };
    desktop.addEventListener('change', closeOnResize);
    return () => desktop.removeEventListener('change', closeOnResize);
  }, []);

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
          {token && <button type="button" onClick={logout} className="study-logout"><LogOut size={17} aria-hidden="true" /> Sign out</button>}
        </div>
      </aside>
      <div className="study-content" id="study-main" tabIndex={-1}>
        {online ? <ServiceHealthBanner url={API_BASE_URL} />
          : <div className="study-health" role="status">You’re offline. <Link className="underline" to="/offline">See what’s available</Link></div>}
        <Outlet />
      </div>
      <nav className="study-tabs" aria-label="Mobile study navigation">
        {mobileItems.map(([to, label, Icon]) => (
          <NavLink key={to} to={to}><Icon size={20} aria-hidden="true" />{label}</NavLink>
        ))}
        <button type="button" aria-haspopup="dialog" aria-controls="study-more" onClick={() => sheet.current?.showModal()}>
          <Ellipsis size={22} aria-hidden="true" /> More
        </button>
      </nav>
      <dialog ref={sheet} className="study-sheet" id="study-more" aria-labelledby="study-more-title"
        onClick={event => { if (event.target === event.currentTarget) closeSheet(); }}>
        <div className="study-sheet-content">
          <header>
            <h2 id="study-more-title">More</h2>
            <button type="button" className="study-sheet-close" onClick={closeSheet} aria-label="Close more menu"><X size={22} /></button>
          </header>
          <nav className="study-nav" aria-label="More study pages">
            {navItems.filter(([to]) => to === '/dashboard' || to === '/turning-points').map(([to, label, Icon]) => (
              <NavLink key={to} to={to} onClick={closeSheet}><Icon size={18} aria-hidden="true" />{label}</NavLink>
            ))}
          </nav>
          {token && <button type="button" onClick={() => { closeSheet(); logout(); }} className="study-logout">
            <LogOut size={18} aria-hidden="true" /> Sign out
          </button>}
        </div>
      </dialog>
    </div>
  );
}
