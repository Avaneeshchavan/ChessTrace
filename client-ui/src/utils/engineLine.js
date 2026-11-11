import { Chess } from 'chess.js';

// Convert the engine's coordinate moves using the position they belong to.
export function formatEngineLine(fen, moves = []) {
  if (!fen || !moves.length) return '';
  const line = [];
  try {
    const chess = new Chess(fen);
    for (const uci of moves.slice(0, 8)) {
      const number = chess.fen().split(' ')[5];
      const white = chess.turn() === 'w';
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      line.push(`${white ? `${number}. ` : line.length ? '' : `${number}… `}${move.san}`);
    }
  } catch {
    // Keep any valid prefix if an interrupted engine search returns a stale tail.
  }
  return line.join(' ');
}
