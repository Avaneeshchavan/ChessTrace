'use client'

import { Play } from 'lucide-react'

export function TurningPointsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Turning Points</h1>

      {/* PGN Input */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <label className="text-sm font-bold text-slate-900 block mb-3">PGN URL or Paste</label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="https://chess.com/games/archive/2024"
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400"
          />
          <button className="px-6 py-2 bg-[#7B4B2A] text-white rounded-lg font-semibold hover:bg-[#6a3f22] transition-colors flex items-center gap-2">
            <Play size={16} />
            Analyze
          </button>
        </div>
      </div>

      {/* Evaluation Swing Chart Placeholder */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Evaluation Swing</h2>
        <div className="h-48 relative border border-slate-200 rounded-lg bg-slate-50 flex items-end gap-1 px-4 py-4">
          {/* Mock chart bars */}
          {Array.from({ length: 20 }).map((_, i) => {
            const height = Math.sin(i * 0.3) * 40 + 50
            const isBlunder = i === 7 || i === 15
            return (
              <div
                key={i}
                className={`flex-1 rounded-t transition-colors ${
                  isBlunder ? 'bg-red-400' : 'bg-[#769656]'
                } hover:opacity-75`}
                style={{ height: `${height}%` }}
              />
            )
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-400 rounded" />
            <span>Blunders detected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#769656] rounded" />
            <span>Position evaluation</span>
          </div>
        </div>
      </div>

      {/* Extracted Puzzles */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-4">Extracted Puzzles</h2>
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="w-full aspect-square bg-slate-100 rounded-lg mb-3 flex items-center justify-center text-4xl">
                {['♗', '♘', '♖'][i - 1]}
              </div>
              <div className="space-y-2">
                <div className="inline-flex gap-2">
                  <span className="bg-[#7B4B2A] text-white text-xs font-semibold px-2 py-1 rounded">
                    {['Pin', 'Fork', 'Skewer'][i - 1]}
                  </span>
                </div>
                <button className="w-full px-3 py-2 bg-[#769656] text-white text-xs font-semibold rounded-lg hover:bg-[#5a4d3a] transition-colors">
                  Save to Vault
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
