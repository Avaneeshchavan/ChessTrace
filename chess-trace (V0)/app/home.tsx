'use client'

import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'

export function HomePage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">Your chess analysis at a glance.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Puzzles Solved</div>
          <div className="text-3xl font-bold text-slate-900">247</div>
          <div className="text-xs text-slate-500 mt-2">+12 this week</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Patterns Tagged</div>
          <div className="text-3xl font-bold text-slate-900">84</div>
          <div className="text-xs text-slate-500 mt-2">6 new this week</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="text-sm text-slate-600 mb-2">Current Streak</div>
          <div className="text-3xl font-bold text-[#769656]">8 days</div>
          <div className="text-xs text-slate-500 mt-2">Keep it going</div>
        </div>
      </div>

      {/* CTA Card */}
      <div className="bg-gradient-to-br from-[#769656] to-[#5a4d3a] rounded-lg p-8 text-white mb-10">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Analyze Your Games</h2>
            <p className="text-white/80 mb-4">Upload a screenshot of your game position to find historical matches and extract key insights.</p>
            <Link href="/lens" className="inline-flex items-center gap-2 bg-white text-[#769656] px-4 py-2 rounded-lg font-semibold hover:bg-slate-50 transition-colors">
              Open Origin Lens <ArrowRight size={18} />
            </Link>
          </div>
          <Zap size={48} className="text-white/30" />
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">Analyzed position from Kasparov vs. Karpov</div>
                <div className="text-sm text-slate-500">2 hours ago</div>
              </div>
              <div className="text-2xl">♞</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
