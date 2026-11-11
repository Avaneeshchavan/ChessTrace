import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { SimilarPositions } from '../components/Board/SimilarPositions';
import { Board } from '../components/Board/Board';
import { EnginePanel } from '../components/EnginePanel/EnginePanel';
import { useStockfish } from '../hooks/useStockfish';
import { inspectSandboxFen } from '../utils/sandboxPosition';
import { API_BASE_URL } from '../config/api';

export default function Sandbox() {
  const [fen, setFen] = useState(DEFAULT_POSITION);
  const [moveError, setMoveError] = useState('');
  const [result, setResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const request = useRef(null);
  const position = useMemo(() => inspectSandboxFen(fen), [fen]);
  const engine = useStockfish(position.engineFen);

  useEffect(() => () => request.current?.abort(), []);

  function changeFen(value) {
    request.current?.abort();
    setResult(null);
    setSearchError('');
    setSearching(false);
    setMoveError('');
    setFen(value);
  }

  function movePiece(orig, dest) {
    if (position.error) return false;
    try {
      const chess = new Chess(position.fen);
      chess.move({ from: orig, to: dest, promotion: 'q' });
      changeFen(chess.fen());
      return true;
    } catch {
      setMoveError('That move is illegal in this position.');
      return false;
    }
  }

  async function search() {
    if (position.error) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/search?fen=${encodeURIComponent(position.fen)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not search the database.');
      if (!controller.signal.aborted) setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error.message);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  return (
    <main className="p-4 md:p-8 space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">Blueprint Sandbox</h1>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-4">
          <label className="block text-sm font-medium">FEN position
            <input type="text" value={fen} onChange={event => changeFen(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-xs" />
          </label>
          {position.error && <p role="status" className="text-sm text-red-700">{position.error} Search DB is disabled.</p>}
          <div className="max-w-xl">
            <Board fen={position.chess?.fen() ?? '8/8/8/8/8/8/8/8'} onMove={movePiece}
              interactive={!position.error} turnColor={position.chess?.turn() === 'b' ? 'black' : 'white'} viewOnly />
          </div>
          {moveError && <p role="status" className="text-sm text-red-700">{moveError}</p>}
          <button type="button" onClick={search} disabled={!!position.error || searching}
            className="rounded bg-[#3b759e] px-4 py-2 font-medium text-white disabled:opacity-50">
            {searching ? 'Searching…' : 'Search DB'}
          </button>
          {searchError && <p role="alert" className="text-sm text-red-700">{searchError}</p>}
          {result && <p role="status" className="text-sm">{result.matches.length} {result.matchType === 'exact' ? 'exact' : 'similar'} positions found.</p>}
          {!position.error && <SimilarPositions key={position.fen} fen={position.fen} />}
        </section>
        <section className="space-y-3">
          {position.engineFen ? <EnginePanel {...engine} />
            : <p className="rounded bg-slate-100 p-4 text-sm">Stockfish needs a position it can analyze safely. Check the FEN and try again.</p>}
          {position.error && position.engineFen && <p className="text-sm text-slate-600">Stockfish is analyzing with corrected position metadata.</p>}
        </section>
      </div>
    </main>
  );
}
