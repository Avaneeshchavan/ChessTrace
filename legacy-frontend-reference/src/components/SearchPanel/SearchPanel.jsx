import { GameResultCard } from './GameResultCard.jsx';

export function SearchPanel({
  status,
  error,
  exactMatches,
  similarMatches,
  onSearch,
  onPreviewFen,
}) {
  return (
    <div className="bg-white border border-slate-200 p-4 flex flex-col gap-4 h-full rounded-xl shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-h2 font-semibold text-slate-900">Database</span>
        <button
          onClick={onSearch}
          className="font-mono text-eyebrow uppercase tracking-[.09em] border border-slate-200 px-2 py-1 bg-slate-50 text-slate-700 hover:bg-[#3b82f6] hover:text-white hover:border-[#3b82f6] transition-colors rounded-md"
        >
          search this position
        </button>
      </div>

      {status === 'loading' && (
        <p className="font-mono text-data text-slate-600">consulting the index…</p>
      )}

      {status === 'error' && <p className="font-mono text-data text-red-500">{error}</p>}

      {status === 'success' && (
        <div className="flex flex-col gap-4 overflow-y-auto">
          <section>
            <p className="font-mono text-eyebrow uppercase tracking-[.09em] text-slate-600 mb-2">
              exact position — {exactMatches.length} found
            </p>
            {exactMatches.length === 0 ? (
              <p className="font-mono text-data text-slate-500 italic">
                No identical position in the corpus. Common — see similarity results below.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {exactMatches.map((m) => (
                  <GameResultCard key={m.positionId} match={m} onPreviewFen={onPreviewFen} />
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="font-mono text-eyebrow uppercase tracking-[.09em] text-slate-600 mb-2">
              tactically similar — {similarMatches.length} found
            </p>
            <div className="flex flex-col gap-2">
              {similarMatches.map((m) => (
                <GameResultCard
                  key={m.positionId}
                  match={m}
                  distance={m.distance}
                  onPreviewFen={onPreviewFen}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {status === 'idle' && (
        <p className="font-mono text-data text-slate-500 italic">
          Set up a position, then search the corpus for it.
        </p>
      )}
    </div>
  );
}
