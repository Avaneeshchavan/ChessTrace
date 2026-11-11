import { fetchService } from '../../config/serviceRequest';
import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { API_BASE_URL } from '../../config/api';
import { Board } from './Board';
import { MoveLedger } from './MoveLedger';

export function GameReplay({ match }) {
  const [data, setData] = useState(null);
  const [ply, setPly] = useState(match.halfMove);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchService(API_BASE_URL, `/api/search/games/${match.gameId}`, { signal: controller.signal });
        if (!response.ok) throw new Error('The game is unavailable for replay.');
        const { pgn } = await response.json();
        const chess = new Chess();
        chess.loadPgn(pgn);
        const moves = chess.history({ verbose: true });
        if (!moves.length || match.halfMove > moves.length || match.halfMove < 1) {
          throw new Error('The matching move is unavailable in the stored game.');
        }
        if (!controller.signal.aborted) {
          setData({ moves, comments: new Map(chess.getComments().map(({ fen, comment }) => [fen, comment])) });
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      }
    }
    load();
    return () => controller.abort();
  }, [match.gameId, match.halfMove]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <div role="status" className="space-y-2"><p className="text-sm text-slate-500">Loading replay…</p><div className="ct-skeleton aspect-square max-w-md" /></div>;

  return (
    <section aria-label="Game replay" className="max-w-md space-y-3">
      <h3 className="text-sm font-semibold">{match.whiteName} vs. {match.blackName}</h3>
      <Board fen={ply ? data.moves[ply - 1].after : data.moves[0].before} interactive={false} viewOnly />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={!ply} onClick={() => setPly(ply - 1)} className="ct-quiet disabled:opacity-50">Previous move</button>
        <span className="font-mono text-xs">{ply ? data.moves[ply - 1].san : 'Start'} · {ply}/{data.moves.length}</span>
        <button type="button" disabled={ply >= data.moves.length} onClick={() => setPly(ply + 1)} className="ct-quiet disabled:opacity-50">Next move</button>
      </div>
      <div className="ct-panel"><MoveLedger moves={data.moves} comments={data.comments} ply={ply} onSelect={setPly} /></div>
    </section>
  );
}
