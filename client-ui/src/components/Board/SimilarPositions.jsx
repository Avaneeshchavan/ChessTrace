import { fetchService } from '../../config/serviceRequest';
import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { GameReplay } from './GameReplay';

const decades = Array.from({ length: 43 }, (_, i) => 2020 - 10 * i);

export function SimilarPositions({ fen }) {
  const [opening, setOpening] = useState('');
  const [era, setEra] = useState('');
  const [matches, setMatches] = useState(null);
  const [replay, setReplay] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);

  async function load(path, kind, handle) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(kind);
    setError('');
    try {
      const response = await fetchService(API_BASE_URL, `/api/search${path}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load results.');
      if (!controller.signal.aborted) handle(data);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading('');
    }
  }

  function search(event) {
    event.preventDefault();
    setMatches(null);
    setReplay(null);
    const query = new URLSearchParams({ fen, opening: opening.trim(), era });
    load(`/similar?${query}`, 'search', ({ matches }) => setMatches(matches));
  }

  return (
    <section className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">Similar positions</h2>
      <form onSubmit={search} className="flex flex-wrap items-end gap-3 text-sm">
        <label>Opening or ECO
          <input value={opening} onChange={event => setOpening(event.target.value)} placeholder="Sicilian or B90" maxLength={80}
            className="mt-1 block rounded border border-slate-300 p-2" />
        </label>
        <label>Era
          <select value={era} onChange={event => setEra(event.target.value)} className="mt-1 block rounded border border-slate-300 p-2">
            <option value="">All years</option>
            {decades.map(year => <option key={year} value={year}>{year}s</option>)}
          </select>
        </label>
        <button disabled={loading === 'search'} className="rounded bg-[var(--ct-accent)] px-3 py-2 font-medium text-white disabled:opacity-50">
          {loading === 'search' ? 'Searching…' : 'Find similar positions'}
        </button>
      </form>
      <p className="text-xs text-slate-600">Filters narrow the nearest 1,000 candidates. Scores compare board structure.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {matches?.length === 0 && <p role="status" className="text-sm">No similar positions matched these filters.</p>}
      {!!matches?.length && <ol className="divide-y divide-slate-200">
        {matches.map(match => (
          <li key={match.id}>
            <button type="button" onClick={() => setReplay(match)} aria-pressed={replay?.id === match.id}
              className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm hover:bg-slate-50">
              <span>
                <strong>{match.whiteName} vs. {match.blackName}</strong>
                <span className="block text-xs text-slate-600">
                  {[match.event, match.playedAt?.slice(0, 4), match.opening || match.eco,
                    `Move ${match.moveNumber}${match.mover === 'black' ? '…' : '.'}`, match.result].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-xs text-sky-800">{Math.round(match.similarity * 100)}% · Replay</span>
            </button>
          </li>
        ))}
      </ol>}
      {replay && <GameReplay key={replay.id} match={replay} />}
    </section>
  );
}
