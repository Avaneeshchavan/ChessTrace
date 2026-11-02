'use client'

import { Volume2, Copy } from 'lucide-react'

interface EngineRoomPanelProps {
  depth?: number
  evaluation?: number
  pv?: string
}

export function EngineRoomPanel({ 
  depth = 20, 
  evaluation = 0.45,
  pv = 'e2e4 e7e5 g1f3 b8c6 f1c4'
}: EngineRoomPanelProps) {
  const evalText = evaluation > 0 ? `+${evaluation}` : `${evaluation}`
  
  return (
    <div className="w-80 bg-white border-l border-slate-200 p-6 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Volume2 size={16} />
          Engine Analysis
        </h3>
      </div>

      {/* Depth Slider */}
      <div>
        <label className="text-xs font-semibold text-slate-600 block mb-2">Depth: {depth}</label>
        <input
          type="range"
          min="1"
          max="25"
          defaultValue={depth}
          className="w-full"
        />
      </div>

      {/* Evaluation Bar */}
      <div>
        <label className="text-xs font-semibold text-slate-600 block mb-2">Evaluation</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-8 bg-gradient-to-r from-[#5a4d3a] via-slate-100 to-[#769656] rounded-md relative">
            <div
              className="absolute top-0 left-1/2 w-1 h-full bg-slate-900 rounded-full"
              style={{ left: `${(evaluation + 5) * 10}%` }}
            />
          </div>
          <div className="font-bold text-slate-900 text-sm w-12 text-right">{evalText}</div>
        </div>
      </div>

      {/* PV (Principal Variation) */}
      <div>
        <label className="text-xs font-semibold text-slate-600 block mb-2">Principal Variation</label>
        <div className="relative">
          <textarea
            readOnly
            value={pv}
            className="w-full h-20 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
          />
          <button className="absolute top-2 right-2 p-1 hover:bg-slate-100 rounded">
            <Copy size={14} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="pt-2 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          <div className="flex justify-between">
            <span>Nodes:</span>
            <span className="font-mono text-slate-900">4.2M</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Time:</span>
            <span className="font-mono text-slate-900">2.5s</span>
          </div>
        </div>
      </div>
    </div>
  )
}
