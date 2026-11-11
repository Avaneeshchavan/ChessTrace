import { EvalBar } from './EvalBar.jsx';
import { Volume2 } from 'lucide-react';

export function EnginePanel({
  ready,
  evaluation,
  bestLine,
  depth,
  setDepth,
  searchDepthReached,
  orientation,
  error,
}) {
  return (
    <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
          <Volume2 size={16} className="text-slate-400" />
          Engine Analysis
        </span>
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
          stockfish.wasm · in-browser
        </span>
      </div>

      <div className="flex gap-4">
        <EvalBar evaluation={evaluation} orientation={orientation} />

        <div className="flex-1 flex flex-col gap-3">
          {error && <p role="status" className="text-sm text-red-700">{error}</p>}
          {!ready && !error && (
            <p className="font-mono text-xs text-slate-400">warming up the engine…</p>
          )}

          {!error && (
            <>
              <div>
                <div className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wider text-slate-400">
                  <span>depth</span>
                  <span>
                    {searchDepthReached || 0} / {depth}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={18}
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="w-full accent-[var(--ct-accent)]"
                />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
                  best line
                </p>
                <p className="font-mono text-sm text-slate-900">
                  {bestLine.length ? bestLine.slice(0, 8).join(' ') : '—'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
