'use client'

import { Filter } from 'lucide-react'

const motifs = ['All', 'Pin', 'Fork', 'Skewer', 'Sacrifice', 'Discovered Attack']
const statuses = ['All', 'Due Today', 'Mastered', 'Learning']

export function PatternVaultPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Pattern Vault</h1>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-8 flex gap-4 items-center">
        <Filter size={16} className="text-slate-500" />
        
        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-slate-50 hover:bg-white">
          {motifs.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>

        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-slate-50 hover:bg-white">
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Pattern Grid */}
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => {
          const motifList = ['Pin', 'Fork', 'Skewer', 'Sacrifice']
          const statusList = ['Due Today', 'Mastered', 'Learning', 'New']
          const motif = motifList[i % motifList.length]
          const status = statusList[i % statusList.length]
          const statusColor =
            status === 'Due Today'
              ? 'bg-[#769656] text-white'
              : status === 'Mastered'
                ? 'bg-slate-400 text-white'
                : 'bg-amber-200 text-slate-900'

          return (
            <div key={i} className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="w-full aspect-square bg-slate-100 flex items-center justify-center text-4xl">
                {['♗', '♘', '♖', '♕'][i % 4]}
              </div>
              <div className="p-4">
                <div className="flex gap-2 mb-3">
                  <span className="bg-[#7B4B2A] text-white text-xs font-semibold px-2 py-1 rounded">
                    {motif}
                  </span>
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded w-fit ${statusColor}`}>
                  {status}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
