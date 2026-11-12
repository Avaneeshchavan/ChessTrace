import { fetchService } from '../config/serviceRequest';
import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { MotifPicker } from '../components/Vault/MotifPicker';
import { Board } from '../components/Board/Board';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { createStockfishClient } from '../hooks/stockfishClient';
import { findTurningPoints } from '../utils/turningPoints';
import { API_BASE_URL } from '../config/api';

const example = 'https://lichess.org/diwRghmF';

function parseGame(pgn, signal) {
  signal.throwIfAborted();
  const worker = new Worker(new URL('../workers/parseGame.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    function finish(error, history) {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(history);
    }
    function cancel() { finish(signal.reason); }
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish(new Error('Could not parse the PGN.'));
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.history);
    worker.postMessage(pgn);
  });
}

export default function TurningPoints() {
  const { token } = useAuth();
  const { logActivity } = useDashboard();
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [month, setMonth] = useState('');
  const [depth, setDepth] = useState(12);
  const [progress, setProgress] = useState(null);
  const [puzzles, setPuzzles] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState([]);
  const [tags, setTags] = useState({});
  const active = useRef(null);
  const isChessCom = /^https:\/\/(www\.)?chess\.com\//i.test(input.trim());

  useEffect(() => () => active.current?.abort(), []);

  async function analyzeGame(event) {
    event.preventDefault();
    if (active.current) return;
    const run = new AbortController();
    active.current = run;
    let engine;
    setError('');
    setPuzzles(null);
    setSaved([]);
    setTags({});
    setProgress({ done: 0, total: 0 });
    try {
      let pgn = input.trim();
      if (!pgn || /^https?:\/\//i.test(pgn)) {
        const response = await fetchService(API_BASE_URL, `/api/games/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pgn || example, username: username.trim(), month }),
          signal: run.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not import the game.');
        pgn = data.pgn;
      }
      if (pgn.length > 100_000) throw new Error('Use a single PGN game under 100,000 characters.');
      const history = await parseGame(pgn, run.signal);
      run.signal.throwIfAborted();
      engine = createStockfishClient();
      run.signal.addEventListener('abort', () => engine.close(), { once: true });
      const positions = [history[0].before, ...history.map(move => move.after)];
      const analyses = [];
      for (const fen of positions) {
        run.signal.throwIfAborted();
        setProgress({ done: analyses.length, total: positions.length });
        const position = new Chess(fen);
        if (position.isCheckmate()) analyses.push({ evaluation: { type: 'mate', value: 0 } });
        else if (position.isDraw()) analyses.push({ evaluation: { type: 'cp', value: 0 } });
        else {
          const analysis = await engine.analyze(fen, depth);
          if (!analysis.evaluation) throw new Error('Stockfish returned no evaluation for a move.');
          analyses.push(analysis);
        }
      }
      const found = findTurningPoints(history, analyses);
      setPuzzles(found);
      logActivity('TURNING_POINTS_RUN', { blundersFound: found.length });
    } catch (err) {
      if (!run.signal.aborted) setError(err.message);
    } finally {
      engine?.close();
      active.current = null;
      setProgress(null);
    }
  }

  async function savePuzzle(puzzle) {
    setSaving(puzzle.index);
    setError('');
    try {
      const response = await fetchService(API_BASE_URL, `/api/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fen: puzzle.fenBefore, initialMove: puzzle.san, solutionPgn: puzzle.solutionPgn,
          mateIn: puzzle.mateIn, tags: tags[puzzle.index] ?? ['Blunder'],
        }),
      });
      if (!response.ok) throw new Error('Could not save the puzzle.');
      setSaved(previous => [...previous, puzzle.index]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Turning Points</h1>
      <form onSubmit={analyzeGame} className="space-y-3 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <label className="block text-sm font-medium">
          Game link or PGN
          <textarea value={input} onChange={e => setInput(e.target.value)} disabled={!!progress}
            placeholder={example} rows={3} className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-sm" />
        </label>
        {isChessCom && (
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">Either player’s Chess.com username
              <input required value={username} onChange={e => setUsername(e.target.value)} disabled={!!progress}
                className="block rounded border border-slate-300 p-2" />
            </label>
            <label className="text-sm">Month the game ended (UTC)
              <input required type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={!!progress}
                className="block rounded border border-slate-300 p-2" />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">Engine depth{' '}
            <input type="number" min="4" max="18" value={depth} onChange={e => setDepth(e.target.valueAsNumber || 12)}
              disabled={!!progress} className="w-16 rounded border border-slate-300 p-1" />
          </label>
          <button disabled={!!progress || saving !== null} className="rounded bg-[var(--ct-accent)] px-4 py-2 font-semibold text-white disabled:opacity-50">Analyze</button>
          {progress && <button type="button" onClick={() => active.current?.abort()} className="underline">Cancel analysis</button>}
        </div>
        {progress && <p role="status" className="text-sm">{progress.total ? `Analyzed ${progress.done} of ${progress.total} positions` : 'Importing game…'}</p>}
        {isChessCom && <p className="text-xs text-slate-500">ChessTrace is independent and unaffiliated with Chess.com.</p>}
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {puzzles?.length === 0 && <p>No moves with a usable solution lost more than 150 centipawns.</p>}
      {!!puzzles?.length && <section aria-label="Extracted puzzles" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {puzzles.map(puzzle => (
          <article key={puzzle.index} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <Board fen={puzzle.fenBefore} orientation={puzzle.color === 'w' ? 'white' : 'black'} interactive={false} viewOnly />
            <div className="space-y-2 p-4">
              <h2 className="font-semibold">Move {puzzle.moveNumber}{puzzle.color === 'w' ? '.' : '…'} {puzzle.san}</h2>
              <p className="text-sm text-slate-600">{puzzle.mateSwing ? 'Forced mate swing' : `Lost ${(puzzle.loss / 100).toFixed(2)} pawns of evaluation`}</p>
              <p className="text-sm">Engine move <strong>{puzzle.bestSan}</strong></p>
              <MotifPicker value={tags[puzzle.index] ?? ['Blunder']} disabled={saving !== null || saved.includes(puzzle.index)}
                onChange={value => setTags(previous => ({ ...previous, [puzzle.index]: value }))} />
              <button type="button" disabled={saving !== null || saved.includes(puzzle.index)} onClick={() => savePuzzle(puzzle)}
                className="rounded bg-[var(--ct-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saved.includes(puzzle.index) ? 'Saved' : saving === puzzle.index ? 'Saving…' : 'Save to Vault'}
              </button>
            </div>
          </article>
        ))}
      </section>}
    </main>
  );
}
