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

export function availableCastling(squares) {
  return Object.entries(castleHome).filter(([, [king, k, rook, r]]) =>
    squares[king]?.piece === k && squares[rook]?.piece === r,
  ).map(([flag]) => flag);
}

export function enPassantTargets(squares, turn) {
  const pawnRank = turn === 'w' ? 5 : 4;
  const targetRank = turn === 'w' ? 6 : 3;
  const pawn = turn === 'w' ? 'bP' : 'wP';
  return [...'abcdefgh'].filter(file => squares[file + pawnRank]?.piece === pawn && !squares[file + targetRank]?.piece)
    .map(file => file + targetRank);
}

export function positionForManualSetup(fen) {
  const empty = '8/8/8/8/8/8/8/8 w - - 0 1';
  if (typeof fen !== 'string') return { fen: empty, squares: [] };
  const symbols = fen.split(' ')[0].replaceAll('/', '').replace(/[1-8]/g, n => '.'.repeat(Number(n)));
  if (!/^[.prnbqkPRNBQK]{64}$/.test(symbols)) return { fen: empty, squares: [] };
  const squares = [...symbols].flatMap((symbol, index) => symbol === '.' ? [] : [{
    square: SQUARES[index],
    piece: (symbol === symbol.toUpperCase() ? 'w' : 'b') + symbol.toUpperCase(),
  }]);
  return { fen, squares };
}

export function reviewPosition(squares, turn, castling, enPassant = '-') {
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
  const rights = availableCastling(squares).filter(flag => castling.includes(flag)).join('') || '-';
  const target = enPassantTargets(squares, turn).includes(enPassant) ? enPassant : '-';
  const fen = `${ranks.join('/')} ${turn} ${rights} ${target} 0 1`;
  const validity = validateFen(fen);
  if (!validity.ok) return { fen, error: validity.error };
  const chess = new Chess(fen);
  const waitingKing = SQUARES.find(key => squares[key]?.piece === (turn === 'w' ? 'bK' : 'wK'));
  if (chess.isAttacked(waitingKing, turn)) {
    return { fen, error: 'The king of the side waiting to move is in check. Check the pieces and whose turn it is.' };
  }
  return { fen, error: null };
}
