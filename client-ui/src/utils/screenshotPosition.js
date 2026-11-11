import { Chess, validateFen } from 'chess.js';

export const SQUARES = Array.from({ length: 64 }, (_, i) =>
  'abcdefgh'[i % 8] + (8 - Math.floor(i / 8))
);

export function initialSquares(result) {
  return Object.fromEntries(result.squares.filter(({ square }) => SQUARES.includes(square)).map(
    ({ square, piece, confidence, needs_review }) => [square, {
      piece,
      confidence,
      flagged: needs_review ?? (result.low_confidence_squares ?? []).includes(square),
    }],
  ));
}

export function rotateSquares(squares) {
  return Object.fromEntries(SQUARES.map((square, i) => [square, squares[SQUARES[63 - i]]]));
}

const castleHome = {
  K: ['e1', 'wK', 'h1', 'wR'],
  Q: ['e1', 'wK', 'a1', 'wR'],
  k: ['e8', 'bK', 'h8', 'bR'],
  q: ['e8', 'bK', 'a8', 'bR'],
};

export function reviewPosition(squares, turn, castling) {
  const ranks = [];
  for (let rank = 0; rank < 8; rank++) {
    let row = '', empty = 0;
    for (const key of SQUARES.slice(rank * 8, rank * 8 + 8)) {
      const piece = squares[key]?.piece;
      if (!piece) { empty++; continue; }
      if (empty) row += empty;
      empty = 0;
      row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
    }
    ranks.push(row + (empty || ''));
  }
  const rights = Object.entries(castleHome).filter(([flag, [king, k, rook, r]]) =>
    castling.includes(flag) && squares[king]?.piece === k && squares[rook]?.piece === r,
  ).map(([flag]) => flag).join('') || '-';
  const fen = `${ranks.join('/')} ${turn} ${rights} - 0 1`;
  const validity = validateFen(fen);
  if (!validity.ok) return { fen, error: validity.error };
  const chess = new Chess(fen);
  const waitingKing = SQUARES.find(key => squares[key]?.piece === (turn === 'w' ? 'bK' : 'wK'));
  if (chess.isAttacked(waitingKing, turn)) {
    return { fen, error: 'The king of the side waiting to move is in check. Check the pieces and whose turn it is.' };
  }
  return { fen, error: null };
}
