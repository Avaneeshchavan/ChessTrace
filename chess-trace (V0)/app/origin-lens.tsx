'use client'

import { Upload } from 'lucide-react'

export function OriginLensPage() {
  return (
    <div className="p-8 flex gap-8 h-full">
      {/* Upload Zone */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-[#7B4B2A] hover:bg-amber-50 transition-colors cursor-pointer group">
            <Upload size={48} className="mx-auto mb-4 text-slate-400 group-hover:text-[#7B4B2A]" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">Upload Screenshot</h2>
            <p className="text-sm text-slate-600">Drag and drop a chess position screenshot, or click to browse</p>
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <div className="w-96 bg-white rounded-lg border border-slate-200 p-6 flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Match Lineage</h3>

        <div className="flex-1 space-y-6 overflow-y-auto pb-4">
          {/* Match 1 */}
          <div className="pb-6 border-b border-slate-200">
            <div className="flex gap-4 mb-3">
              <div className="w-16 h-16 bg-slate-100 rounded-md flex items-center justify-center text-2xl">♟</div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">Kasparov vs. Karpov</div>
                <div className="text-sm text-slate-600">World Championship 1985</div>
                <div className="mt-2 inline-flex items-center gap-2">
                  <span className="bg-[#769656] text-white text-xs font-semibold px-2 py-1 rounded">97% Match</span>
                  <span className="text-xs text-slate-500">High confidence</span>
                </div>
              </div>
            </div>
          </div>

          {/* Match 2 */}
          <div className="pb-6 border-b border-slate-200">
            <div className="flex gap-4 mb-3">
              <div className="w-16 h-16 bg-slate-100 rounded-md flex items-center justify-center text-2xl">♞</div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">Fischer vs. Spassky</div>
                <div className="text-sm text-slate-600">Reykjavik 1972</div>
                <div className="mt-2 inline-flex items-center gap-2">
                  <span className="bg-[#7B4B2A] text-white text-xs font-semibold px-2 py-1 rounded">84% Match</span>
                  <span className="text-xs text-slate-500">Medium confidence</span>
                </div>
              </div>
            </div>
          </div>

          {/* Match 3 */}
          <div>
            <div className="flex gap-4 mb-3">
              <div className="w-16 h-16 bg-slate-100 rounded-md flex items-center justify-center text-2xl">♗</div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">Carlsen vs. Caruana</div>
                <div className="text-sm text-slate-600">Candidates 2018</div>
                <div className="mt-2 inline-flex items-center gap-2">
                  <span className="bg-slate-400 text-white text-xs font-semibold px-2 py-1 rounded">71% Match</span>
                  <span className="text-xs text-slate-500">Lower confidence</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
