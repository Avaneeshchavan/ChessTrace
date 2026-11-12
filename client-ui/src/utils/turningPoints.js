import { Chess } from 'chess.js';

function scoreForMover(evaluation, turn, mover) {
  if (!evaluation) return null;
  const value = evaluation.type === 'mate'
    ? (evaluation.value > 0 ? 100_000 : -100_000)
    : Math.max(-10_000, Math.min(10_000, evaluation.value));
  return turn === mover ? value : -value;
}

export function findTurningPoints(history, analyses) {
  const puzzles = [];
  for (const [index, move] of history.entries()) {
    const before = analyses[index];
    const after = analyses[index + 1];
    const beforeScore = scoreForMover(before.evaluation, move.color, move.color);
    const afterScore = scoreForMover(after.evaluation, move.color === 'w' ? 'b' : 'w', move.color);
    if (beforeScore == null || afterScore == null || beforeScore - afterScore <= 150) continue;
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(before.bestMove ?? '') || before.bestMove === move.lan) continue;

    const solution = new Chess(move.before);
    let best;
    try {
      best = solution.move({ from: before.bestMove.slice(0, 2), to: before.bestMove.slice(2, 4), promotion: before.bestMove[4] });
    } catch {
      continue;
    }
    puzzles.push({
      index,
      moveNumber: Number(move.before.split(' ')[5]),
      color: move.color,
      san: move.san,
      fenBefore: move.before,
      bestSan: best.san,
      solutionPgn: solution.pgn(),
      mateIn: before.evaluation.type === 'mate' && before.evaluation.value > 0 ? before.evaluation.value : null,
      loss: beforeScore - afterScore,
      mateSwing: before.evaluation.type === 'mate' || after.evaluation.type === 'mate',
    });
  }
  return puzzles.sort((a, b) => b.loss - a.loss || a.index - b.index).slice(0, 3);
}
