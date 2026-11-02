import { NavLink, Outlet } from 'react-router-dom';
import { Home, Eye, Zap, TrendingUp, Grid3x3, Settings, ChevronUp, LogOut } from 'lucide-react';
import ChessTraceLogo from './ChessTraceLogo';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/lens',      label: 'Origin Lens', icon: Eye },
  { to: '/sandbox',   label: 'Blueprint Sandbox', icon: Zap },
  { to: '/turning-points', label: 'Turning Points', icon: TrendingUp },
  { to: '/vault',     label: 'Pattern Vault', icon: Grid3x3 },
  { to: '/settings',  label: 'Settings', icon: Settings },
];

export function Shell() {
  const { logout } = useAuth();
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-white ring-1 ring-slate-900/5">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-100">
          <ChessTraceLogo />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors border-l-2 ${
                  isActive
                    ? 'border-l-[#3b759e] text-[#3b759e] bg-[#3b759e]/5 font-medium'
                    : 'border-l-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Engine Room Footer */}
        <div className="border-t border-slate-100 px-3 py-4">
          <div className="px-4 py-3 rounded-lg bg-slate-50 ring-1 ring-slate-900/5">
            <div className="flex items-center gap-2 mb-2">
              <ChevronUp size={16} className="text-slate-400" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Engine Room</span>
            </div>
            <p className="text-xs text-slate-500">Depth: 20 · Eval: +0.45</p>
          </div>
          <button
            onClick={logout}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
