import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { SimilarPositions } from '../components/Board/SimilarPositions';
import { MoveLedger } from '../components/Board/MoveLedger';
import { Board } from '../components/Board/Board';
import { EnginePanel } from '../components/EnginePanel/EnginePanel';
import { useStockfish } from '../hooks/useStockfish';
import { inspectSandboxFen } from '../utils/sandboxPosition';
import { API_BASE_URL } from '../config/api';

export default function Sandbox() {
  const [fen, setFen] = useState(DEFAULT_POSITION);
  const [moves, setMoves] = useState([]);
  const [moveError, setMoveError] = useState('');
  const [result, setResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const request = useRef(null);
  const position = useMemo(() => inspectSandboxFen(fen), [fen]);
  const engine = useStockfish(position.engineFen);

  useEffect(() => () => request.current?.abort(), []);

  function changeFen(value, move) {
    request.current?.abort();
    setResult(null);
    setSearchError('');
    setSearching(false);
    setMoveError('');
    setFen(value);
    setMoves(previous => move ? [...previous, move] : []);
  }

  function movePiece(orig, dest) {
    if (position.error) return false;
    try {
      const chess = new Chess(position.fen);
      const move = chess.move({ from: orig, to: dest, promotion: 'q' });
      changeFen(chess.fen(), move);
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
    <main className="ct-workspace">
      <header className="ct-workspace-header">
        <h1>Sandbox</h1>
        <p>Play through a position, compare matches, and explore the next move.</p>
      </header>
      <div className="sandbox-layout">
        <section className="sandbox-board min-w-0 space-y-4">
          <details className="sandbox-position" open={!!position.error}>
            <summary>Load a position (FEN)</summary>
            <label className="mt-2 block text-sm font-medium">Position code
            <span className="block text-sm font-normal text-slate-500">Paste a FEN to explore a specific position.</span>
            <input type="text" value={fen} onChange={event => changeFen(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-xs" />
          </label>
          </details>
          {position.error && <p role="status" className="text-sm text-red-700">{position.error} Matching games is unavailable until the position is valid.</p>}
          <div className="max-w-xl">
            <Board fen={position.chess?.fen() ?? '8/8/8/8/8/8/8/8'} onMove={movePiece}
              interactive={!position.error} turnColor={position.chess?.turn() === 'b' ? 'black' : 'white'} viewOnly />
          </div>
          {moveError && <p role="status" className="text-sm text-red-700">{moveError}</p>}
          <button type="button" onClick={search} disabled={!!position.error || searching}
            className="ct-button">
            {searching ? 'Searching…' : 'Find matching games'}
          </button>
          {searchError && <p role="alert" className="text-sm text-red-700">{searchError}</p>}
          {result && <p role="status" className="text-sm">{result.matches.length} {result.matchType === 'exact' ? 'exact' : 'similar'} positions found.</p>}
        </section>
        <section className="space-y-3">
          <div className="ct-panel"><MoveLedger moves={moves} /></div>
          {position.engineFen ? <EnginePanel {...engine} fen={position.engineFen} />
            : <p className="rounded bg-slate-100 p-4 text-sm">Stockfish needs a position it can analyze safely. Check the FEN and try again.</p>}
          {position.error && position.engineFen && <p className="text-sm text-slate-600">Stockfish is analyzing with corrected position metadata.</p>}
        </section>
        {!position.error && <div className="sandbox-similar"><SimilarPositions key={position.fen} fen={position.fen} /></div>}
      </div>
    </main>
  );
}
