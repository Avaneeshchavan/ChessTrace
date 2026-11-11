import { EvalBar } from './EvalBar.jsx';
import { Cpu } from 'lucide-react';
import { formatEngineLine } from '../../utils/engineLine';

export function EnginePanel({
  fen,
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
    <div className="ct-panel engine-panel p-5 flex flex-col gap-4">
      <div className="engine-heading">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
          <Cpu size={16} className="text-slate-400" aria-hidden="true" />
          Engine Analysis
        </span>
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
          Stockfish · runs on your device
        </span>
      </div>

      <div className="flex gap-4">
        <EvalBar evaluation={evaluation} orientation={orientation} />

        <div className="min-w-0 flex-1 flex flex-col gap-3">
          {error && <p role="status" className="text-sm text-red-700">{error}</p>}
          {!ready && !error && (
            <p className="font-mono text-xs text-slate-400">warming up the engine…</p>
          )}

          {!error && (
            <>
              <div>
                <div className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wider text-slate-400">
                  <label htmlFor="engine-depth">Search depth</label>
                  <span>
                    {searchDepthReached || 0} / {depth}
                  </span>
                </div>
                <input
                  id="engine-depth"
                  type="range"
                  min={4}
                  max={18}
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="min-h-11 w-full accent-[var(--ct-accent)]"
                />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
                  Suggested continuation
                </p>
                <p className="font-mono text-sm text-slate-900">
                  {formatEngineLine(fen, bestLine) || (ready ? 'No continuation available.' : 'Waiting for analysis…')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
