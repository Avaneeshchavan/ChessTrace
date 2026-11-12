import { createStockfishClient } from '../hooks/stockfishClient.js';
import { inspectSandboxFen } from './sandboxPosition.js';

const SEARCH_DEPTH = 12;

export async function moveEvalLoss(fen, solution, move, signal) {
  if (move.lan === solution.moves[0].lan) return 0;
  if (solution.mateIn) return null;
  const { error, engineFen } = inspectSandboxFen(fen);
  if (error || !engineFen) throw new Error('This saved position cannot be graded safely.');
  signal.throwIfAborted();
  const engine = createStockfishClient();
  const stop = () => engine.close();
  signal.addEventListener('abort', stop, { once: true });
  try {
    const best = await engine.analyze(engineFen, SEARCH_DEPTH);
    if (!best.evaluation) throw new Error('Stockfish did not evaluate the position.');
    if (best.evaluation.type === 'mate' && best.evaluation.value > 0) return null;
    const played = await engine.analyze(engineFen, SEARCH_DEPTH, undefined, { searchMove: move.lan });
    if (!played.evaluation || played.bestMove !== move.lan) {
      throw new Error('Stockfish could not evaluate your move.');
    }
    if (best.evaluation.type === 'mate') return null;
    if (played.evaluation.type === 'mate') return played.evaluation.value > 0 ? null : 100_000;
    return Math.min(100_000, Math.max(0, best.evaluation.value - played.evaluation.value));
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
  }
}

export function suggestedQuality(attempt) {
  if (!attempt) return null;
  return attempt.correct ? (attempt.usedHint ? 3 : 4) : 1;
}
