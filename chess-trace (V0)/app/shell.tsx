'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Eye, Zap, TrendingUp, Grid3x3, Settings, ChevronUp } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/lens', label: 'Origin Lens', icon: Eye },
  { href: '/sandbox', label: 'Blueprint Sandbox', icon: Zap },
  { href: '/turning-points', label: 'Turning Points', icon: TrendingUp },
  { href: '/vault', label: 'Pattern Vault', icon: Grid3x3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function ChessTraceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-60 border-r border-slate-200 bg-white flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#769656] to-[#5a4d3a] rounded-lg" />
            <span className="text-lg font-bold tracking-tight text-slate-900">ChessTrace</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'bg-emerald-50 border-l-[#769656] text-[#769656]'
                    : 'border-l-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Engine Room Footer */}
        <div className="border-t border-slate-200 px-3 py-4">
          <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <ChevronUp size={16} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-600">Engine Room</span>
            </div>
            <p className="text-xs text-slate-500">Depth: 20 • Eval: +0.45</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50">
        {children}
      </main>
    </div>
  )
}
