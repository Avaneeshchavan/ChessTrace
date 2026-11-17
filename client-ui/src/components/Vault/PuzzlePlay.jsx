import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../Board/Board';
import { moveEvalLoss, suggestedQuality } from '../../utils/puzzleGrading';
import { API_BASE_URL } from '../../config/api';
import { fetchService } from '../../config/serviceRequest';

const ratings = [[1, 'Again'], [3, 'Hard'], [4, 'Good'], [5, 'Easy']];
const promotionNames = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
const MAX_ATTEMPT_MILLIS = 86_400_000;

function playableMoves(puzzle) {
  if (!puzzle.solution?.moves.length) return [];
  try { return new Chess(puzzle.fen).moves({ verbose: true }); }
  catch { return []; }
}

export function PuzzlePlay({ puzzle, token, toleranceCp, onRate, rating, ratingError }) {
  const [hint, setHint] = useState(0);
  const [promotion, setPromotion] = useState(null);
  const [play, setPlay] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const started = useRef(null);
  const active = useRef(null);
  const moves = useMemo(() => playableMoves(puzzle), [puzzle]);
  const destinations = useMemo(() => {
    const map = new Map();
    for (const { from, to } of moves) {
      const squares = map.get(from) ?? [];
      if (!squares.includes(to)) squares.push(to);
      map.set(from, squares);
    }
    return map;
  }, [moves]);

  useEffect(() => {
    started.current = performance.now();
    return () => active.current?.abort();
  }, []);

  const solution = puzzle.solution;
  const best = solution?.moves[0];
  const black = puzzle.fen.split(' ')[1] === 'b';
  const interactive = moves.length > 0 && !play && !promotion && !revealed;
  const hintSquares = interactive && hint ? [best.lan.slice(0, 2), best.lan.slice(2, 4)].slice(0, hint) : undefined;
  const outcome = play?.outcome;
  const suggested = suggestedQuality(outcome);
  const finalSolution = solution?.moves.at(-1);
  const displayFen = (revealed && finalSolution?.after) || play?.move.after || puzzle.fen;
  const lastMove = revealed ? finalSolution?.lan : play?.move.lan;

  async function submit(item) {
    if (active.current) return;
    const request = new AbortController();
    active.current = request;
    setPlay({ ...item, busy: true, error: '' });
    let payload = item.payload;
    try {
      if (!payload) {
        const evalLoss = await moveEvalLoss(puzzle.fen, solution, item.move, request.signal);
        payload = { attemptId: item.id, moveUci: item.move.lan, usedHint: item.usedHint, evalLoss, millis: item.millis };
      }
      const response = await fetchService(API_BASE_URL, `/api/vault/${puzzle.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record your move.');
      if (!request.signal.aborted) setPlay({ ...item, payload, outcome: data.attempt, busy: false, error: '' });
    } catch (error) {
      if (!request.signal.aborted) setPlay({ ...item, payload, busy: false, error: error.message || 'Could not grade your move.' });
    } finally {
      if (active.current === request) active.current = null;
    }
  }

  function chooseMove(move) {
    setPromotion(null);
    const millis = started.current === null ? 0 : Math.round(performance.now() - started.current);
    submit({
      move, id: crypto.randomUUID(), usedHint: hint > 0, millis: Math.min(MAX_ATTEMPT_MILLIS, millis),
    });
  }

  function movePiece(from, to) {
    if (!interactive || active.current) return false;
    const candidates = moves.filter(move => move.from === from && move.to === to);
    if (!candidates.length) return false;
    if (candidates[0].promotion) {
      setPromotion(candidates);
      return false;
    }
    chooseMove(candidates[0]);
    return true;
  }

  return (
    <div className="puzzle-play">
      <section className="min-w-0 space-y-3" aria-label="Puzzle board">
        <p className="text-sm font-semibold text-accent">{black ? 'Black' : 'White'} to move{solution?.mateIn ? ` · Mate in ${solution.mateIn}` : ''}</p>
        <div className="puzzle-board">
          <Board fen={displayFen} orientation={black ? 'black' : 'white'} turnColor={black ? 'black' : 'white'}
            interactive={interactive} destinations={destinations} hints={hintSquares} onMove={movePiece} viewOnly
            lastMove={lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []} />
        </div>
        {!!puzzle.tags?.length && <ul className="flex flex-wrap gap-2" aria-label="Puzzle motifs">
          {puzzle.tags.map(tag => <li key={tag.id ?? tag.name} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{tag.name}</li>)}
        </ul>}
      </section>
      <section className="ct-panel puzzle-controls" aria-label="Puzzle controls">
        {promotion && <div className="space-y-3">
          <p className="font-semibold">Promote to</p>
          <div className="puzzle-ratings">
            {promotion.map(move => <button key={move.promotion} type="button" className="ct-quiet"
              onClick={() => chooseMove(move)}>{promotionNames[move.promotion]}</button>)}
          </div>
          <button type="button" className="ct-quiet" onClick={() => setPromotion(null)}>Cancel promotion</button>
        </div>}

        {interactive && <div className="space-y-3">
          <p>{hint === 0 ? 'Play the strongest move from this position.'
            : hint === 1 ? `Hint: move the piece on ${best.lan.slice(0, 2)}.`
            : `Hint: play from ${best.lan.slice(0, 2)} to ${best.lan.slice(2, 4)}.`}</p>
          {hint < 2 && <button type="button" className="ct-quiet" onClick={() => setHint(hint + 1)}>
            {hint === 0 ? 'Hint: show piece' : 'Hint: show destination'}
          </button>}
        </div>}
        {play?.busy && <p role="status">Checking {play.move.san}…</p>}
        {play?.error && !revealed && <div className="space-y-3">
          <p role="alert" className="text-red-700">{play.error}</p>
          <button type="button" className="ct-quiet" onClick={() => submit(play)}>Retry move</button>
        </div>}

        {outcome && <p role="status" className={outcome.correct ? 'text-accent' : 'text-red-700'}>
          {outcome.correct ? (outcome.moveUci === best.lan ? `${play.move.san} is the saved solution.`
            : `${play.move.san} is different, but also strong.`) : `${play.move.san} falls short of the saved solution.`}
        </p>}
        {!revealed && !promotion && !play?.busy && <button type="button" className="ct-quiet" onClick={() => setRevealed(true)}>Reveal Answer</button>}
        {revealed && <div className="rounded-lg bg-slate-100 p-3">
          {best ? <><p className="text-sm text-slate-500">Saved solution</p><p className="font-semibold">{solution.moves.map(move => move.san).join(' ')}</p></>
            : <p>No engine solution was saved for this puzzle.</p>}
        </div>}

        {(outcome || revealed) && <div className="space-y-2">
          <p className="text-sm text-slate-500">{suggested === null ? 'How difficult was this?'
            : `Suggested rating: ${ratings.find(([quality]) => quality === suggested)[1]}. Choose any rating.`}</p>
          {ratingError && <p role="alert" className="text-sm text-red-700">{ratingError}</p>}
          <div className="puzzle-ratings" role="group" aria-label="Review rating">
            {ratings.map(([quality, label]) => <button key={quality} type="button" disabled={rating}
              className={quality === suggested ? 'ct-button' : 'ct-quiet'} onClick={() => onRate(quality)}>{label}</button>)}
          </div>
        </div>}
        {!best && !revealed && <p className="text-sm text-slate-500">This puzzle has no playable solution. You can still rate the review.</p>}
        {interactive && !solution.mateIn && <p className="text-xs text-slate-500">Alternate moves within {toleranceCp} centipawns can qualify.</p>}
      </section>
    </div>
  );
}
