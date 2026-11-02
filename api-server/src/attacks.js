// ChessTrace - Shared geometric attack-map helper
//
// Given a parsed 8x8 board grid (rank8-first, file-a-first — same shape as
// chess.js's `.board()` output: grid[rankIdx][fileIdx] is either null or
// { type, color }), determines whether a given color attacks a given
// square, purely by piece geometry.
//
// WHY THIS EXISTS SEPARATELY FROM chess.js's OWN MOVE GENERATION:
// chess.js's `Chess` constructor validates the FEN it's given and — quite
// reasonably for its own purpose — throws if the side NOT to move is in
// check. That's a problem for us in two different places (src/vector.js's
// king-zone attacker/defender count, and src/legality.js's "side not to
// move must not be in check" test) because both need to ask "does color X
// attack square S" for an arbitrary X, independent of whose turn it
// nominally is. Flipping the turn field and re-parsing with chess.js turns
// "the side to move is in check" (completely normal — that's just check)
// into "the side not to move is in check" (invalid), so chess.js throws on
// exactly the tactical, check-heavy positions this project cares about
// most. Plain geometric attack detection has no such notion of "turn" or
// "legality" to trip over, so it sidesteps the problem entirely.

const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAGONAL_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONAL_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function inBounds(r, f) {
  return r >= 0 && r <= 7 && f >= 0 && f <= 7;
}

/**
 * True if any piece of `color` attacks (targetRank, targetFile) on `grid`.
 * Ignores whose turn it is and ignores pins — this is a raw attack map,
 * not a legal-move filter.
 *
 * @param {Array<Array<{type:string,color:string}|null>>} grid rank8-first, file-a-first
 * @param {number} targetRank 0 (rank 8) .. 7 (rank 1)
 * @param {number} targetFile 0 (file a) .. 7 (file h)
 * @param {'w'|'b'} color
 */
function isSquareAttackedBy(grid, targetRank, targetFile, color) {
  // Pawns: a white pawn attacking (tr,tf) sits one rank "below" it in array
  // terms (rankIdx = tr + 1), because white advances toward rankIdx 0.
  const pawnDr = color === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const r = targetRank + pawnDr;
    const f = targetFile + df;
    if (inBounds(r, f)) {
      const piece = grid[r][f];
      if (piece && piece.type === 'p' && piece.color === color) return true;
    }
  }

  for (const [dr, df] of KNIGHT_OFFSETS) {
    const r = targetRank + dr;
    const f = targetFile + df;
    if (inBounds(r, f)) {
      const piece = grid[r][f];
      if (piece && piece.type === 'n' && piece.color === color) return true;
    }
  }

  for (const [dr, df] of [...DIAGONAL_DIRS, ...ORTHOGONAL_DIRS]) {
    const r = targetRank + dr;
    const f = targetFile + df;
    if (inBounds(r, f)) {
      const piece = grid[r][f];
      if (piece && piece.type === 'k' && piece.color === color) return true;
    }
  }

  for (const [dr, df] of DIAGONAL_DIRS) {
    let r = targetRank + dr;
    let f = targetFile + df;
    while (inBounds(r, f)) {
      const piece = grid[r][f];
      if (piece) {
        if (piece.color === color && (piece.type === 'b' || piece.type === 'q')) return true;
        break; // blocked, whether by friend or foe
      }
      r += dr; f += df;
    }
  }

  for (const [dr, df] of ORTHOGONAL_DIRS) {
    let r = targetRank + dr;
    let f = targetFile + df;
    while (inBounds(r, f)) {
      const piece = grid[r][f];
      if (piece) {
        if (piece.color === color && (piece.type === 'r' || piece.type === 'q')) return true;
        break;
      }
      r += dr; f += df;
    }
  }

  return false;
}

/** Counts how many of `squares` (algebraic strings; nulls allowed) are attacked by `color`. */
function countAttackersOnSquares(grid, color, squares, squareToRankFile) {
  let count = 0;
  for (const sq of squares) {
    if (!sq) continue;
    const { rank, file } = squareToRankFile(sq);
    if (isSquareAttackedBy(grid, rank, file, color)) count += 1;
  }
  return count;
}

module.exports = { isSquareAttackedBy, countAttackersOnSquares, inBounds };
