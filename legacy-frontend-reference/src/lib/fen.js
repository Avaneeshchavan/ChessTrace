import { Chess } from 'chess.js';

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Derive fenCore per EXPLANATION.md §1: piece placement + active color +
 * castling rights, WITHOUT en-passant target or the two move counters.
 * This is the value sent to /api/search/exact and /api/search/similar —
 * never the full FEN, since the halfmove/fullmove counters and en-passant
 * square would make two "same position" boards fail to match.
 */
export function toFenCore(fullFen) {
  const [placement, active, castling] = fullFen.trim().split(/\s+/);
  return `${placement} ${active} ${castling || '-'}`;
}

/**
 * Build a full, chess.js-loadable FEN from a fenCore-equivalent piece
 * placement field (what Phase 2 calls `piece_placement_field`), filling
 * in best-effort defaults for the fields vision can't reliably read.
 * Mirrors Phase 2's own `best_effort_fields` / `clocks_are_placeholder`
 * flags — this is a UI-side re-derivation for cases where we only have
 * the placement string in hand (e.g. pasted into the FEN box).
 */
export function placementToFullFen(placement, { active = 'w', castling = '-' } = {}) {
  return `${placement} ${active} ${castling} - 0 1`;
}

/**
 * Syntactic-only legality check, per EXPLANATION.md §6: this answers
 * "is this FEN internally well-formed" (piece counts, one king per side,
 * side-not-to-move not in check, etc. — whatever chess.js's constructor
 * validates), NOT "is this reachable via a legal game." We surface that
 * distinction in the UI copy rather than implying a stronger guarantee.
 */
export function checkSyntacticLegality(fullFen) {
  try {
    // eslint-disable-next-line no-new
    new Chess(fullFen);
    return { legal: true, reason: null };
  } catch (err) {
    return { legal: false, reason: err.message || 'Position is not well-formed.' };
  }
}

/** True/false side-to-move toggle on a full FEN string. */
export function flipSideToMove(fullFen) {
  const parts = fullFen.trim().split(/\s+/);
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  return parts.join(' ');
}

/**
 * chessground wants a Map<square, piece> ("cg-style") for its own state;
 * this adapts a FEN's placement field into that shape without going
 * through chess.js, so a syntactically-invalid-but-freely-editable
 * sandbox position (e.g. two kings, mid-edit) can still be drawn.
 */
export function placementToChessgroundPieces(placement) {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const pieces = new Map();
  const rows = placement.split('/');
  rows.forEach((row, rankIdxFromTop) => {
    const rank = 8 - rankIdxFromTop;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'white' : 'black';
      const role = PIECE_LETTER_TO_ROLE[ch.toLowerCase()];
      pieces.set(`${files[file]}${rank}`, { role, color });
      file += 1;
    }
  });
  return pieces;
}

const PIECE_LETTER_TO_ROLE = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Replay a SAN move sequence from the starting position, returning the
 *  FEN after each ply, for the search-result "step through the game"
 *  stepper. Stops early (rather than throwing) if a move fails to apply,
 *  since result data from the API is outside our control. */
export function fensAlongMoveSequence(moveSequenceSAN) {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of moveSequenceSAN) {
    try {
      chess.move(san);
      fens.push(chess.fen());
    } catch {
      break;
    }
  }
  return fens;
}
