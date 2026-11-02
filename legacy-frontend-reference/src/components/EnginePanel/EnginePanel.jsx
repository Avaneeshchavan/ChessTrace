import { EvalBar } from './EvalBar.jsx';

export function EnginePanel({
  ready,
  evaluation,
  bestLine,
  depth,
  setDepth,
  searchDepthReached,
  orientation,
}) {
  return (
    <div className="border border-border bg-surface p-4 flex flex-col gap-4 rounded-md">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-h2 font-semibold">Engine</span>
        <span className="font-mono text-eyebrow tracking-[.09em] uppercase text-text-muted">
          stockfish.wasm · in-browser
        </span>
      </div>

      <div className="flex gap-4">
        <EvalBar evaluation={evaluation} orientation={orientation} />

        <div className="flex-1 flex flex-col gap-3">
          {!ready && (
            <p className="font-mono text-data text-text-muted">warming up the engine…</p>
          )}

          {ready && (
            <>
              <div>
                <div className="flex items-baseline justify-between font-mono text-eyebrow uppercase tracking-[.09em] text-text-muted">
                  <span>depth</span>
                  <span>
                    {searchDepthReached || 0} / {depth}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              <div>
                <p className="font-mono text-eyebrow uppercase tracking-[.09em] text-text-muted mb-1">
                  best line
                </p>
                <p className="font-mono text-data text-text-main">
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
