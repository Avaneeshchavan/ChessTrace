// ChessTrace - Syntactic legality check
//
// *** SCOPE / LIMITATION — READ BEFORE USING ***
// This module checks that a position is *syntactically* well-formed and not
// obviously impossible. It does NOT and CANNOT prove that a position is
// reachable via a legal sequence of moves from the starting position
// ("retrograde reachability" / "proof game" analysis). That problem is
// computationally impractical in general (it's related to unsolved problems
// in retrograde chess analysis and can require searching enormous game
// trees, sometimes proven only by specialized retrograde solvers for
// hand-picked studies). Positions that pass every check here can still be
// unreachable in a real game (e.g. an early-game FEN with promoted extra
// queens instead of pawns, all the right piece counts, but an arrangement
// no real game would produce). Treat a `true` result as "not obviously
// broken," never as "verified legal game position."
//
// This module intentionally does NOT construct a chess.js `Chess` object at
// all. An earlier version did, to reuse chess.js for the "side not to move
// is in check" test — but that requires flipping the FEN's turn field, and
// chess.js's own constructor validation throws whenever the resulting
// position has the side NOT to move in check. Since our actual goal here is
// *exactly* "is the side not to move in check", flipping the turn field
// turns the normal, common case ("the side to move is in check" — i.e. any
// position where someone is giving check) into the case chess.js refuses to
// parse. That would make this checker incorrectly reject huge numbers of
// perfectly legal, ordinary tactical positions. Instead we parse the board
// ourselves and reuse the shared geometric attack map (src/attacks.js),
// which has no concept of "turn" or "legality" to trip over.

const { isSquareAttackedBy } = require('./attacks');

const STARTING_COUNT = { n: 2, b: 2, r: 2, q: 1 };

/**
 * Parses the piece-placement field of a FEN (or fenCore) into an 8x8 nested
 * array, grid[rankIdx][fileIdx], rankIdx 0 = rank 8 .. 7 = rank 1, fileIdx
 * 0 = file a .. 7 = file h (same shape as chess.js's `.board()` output, and
 * the shape src/attacks.js expects). Each cell is either null or
 * { type: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b' }.
 */
function parseBoard(placementField) {
  const ranks = placementField.split('/');
  if (ranks.length !== 8) {
    throw new Error(`Malformed piece placement (expected 8 ranks, got ${ranks.length})`);
  }
  const grid = ranks.map((rankStr, rankIdx) => {
    const row = new Array(8).fill(null);
    let file = 0;
    for (const ch of rankStr) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase();
        if (!'pnbrqk'.includes(type)) {
          throw new Error(`Unrecognized piece character "${ch}"`);
        }
        if (file > 7) throw new Error(`Rank ${8 - rankIdx} overflows 8 files`);
        row[file] = { type, color };
        file += 1;
      }
    }
    if (file !== 8) throw new Error(`Rank ${8 - rankIdx} does not sum to 8 files`);
    return row;
  });
  return grid;
}

/**
 * Runs all syntactic legality checks against a FEN or fenCore string.
 * Accepts either a full 6-field FEN or our 3-field fenCore (board, turn,
 * castling) — missing fields are padded with harmless defaults before
 * handing to chess.js.
 *
 * @param {string} fenOrCore
 * @returns {{ legal: boolean, reasons: string[] }}
 */
function checkSyntacticLegality(fenOrCore) {
  const reasons = [];
  const fields = fenOrCore.trim().split(/\s+/);
  const [placement, turn = 'w', castling = '-'] = fields;

  let grid;
  try {
    grid = parseBoard(placement);
  } catch (err) {
    return { legal: false, reasons: [`Unparseable board: ${err.message}`] };
  }

  // --- Exactly one king per side (and remember where, for the check test below) ---
  const kingCount = { w: 0, b: 0 };
  const kingSquare = { w: null, b: null };
  const pawnCount = { w: 0, b: 0 };
  const pieceCount = { w: {}, b: {} };

  grid.forEach((row, rankIdx) => {
    row.forEach((sq, fileIdx) => {
      if (!sq) return;
      if (sq.type === 'k') {
        kingCount[sq.color] += 1;
        kingSquare[sq.color] = { rank: rankIdx, file: fileIdx };
      }
      if (sq.type === 'p') {
        pawnCount[sq.color] += 1;
        const rank8From1 = 8 - rankIdx; // rank 1..8
        if (rank8From1 === 1 || rank8From1 === 8) {
          reasons.push(`Pawn on rank ${rank8From1} (color ${sq.color})`);
        }
      }
      pieceCount[sq.color][sq.type] = (pieceCount[sq.color][sq.type] || 0) + 1;
    });
  });

  if (kingCount.w !== 1) reasons.push(`White must have exactly 1 king, found ${kingCount.w}`);
  if (kingCount.b !== 1) reasons.push(`Black must have exactly 1 king, found ${kingCount.b}`);

  // --- No more than 8 pawns per side ---
  if (pawnCount.w > 8) reasons.push(`White has ${pawnCount.w} pawns (max 8)`);
  if (pawnCount.b > 8) reasons.push(`Black has ${pawnCount.b} pawns (max 8)`);

  // --- Total piece counts within physically possible bounds ---
  // A side can never have more of a promotable piece type than
  // (starting count) + (pawns that could have promoted). We don't know
  // how many pawns *did* promote, so the bound uses the worst case:
  // every "missing" pawn (relative to 8) could theoretically have become
  // that exact piece type. This is intentionally permissive — it flags
  // only impossible counts, not merely improbable ones.
  for (const color of ['w', 'b']) {
    const missingPawns = 8 - Math.min(pawnCount[color], 8); // pawns not on board
    for (const type of ['n', 'b', 'r', 'q']) {
      const have = pieceCount[color][type] || 0;
      const maxPossible = STARTING_COUNT[type] + missingPawns;
      if (have > maxPossible) {
        reasons.push(
          `${color === 'w' ? 'White' : 'Black'} has ${have} ${type.toUpperCase()}(s), ` +
          `but at most ${maxPossible} are possible given ${pawnCount[color]} pawns on board`
        );
      }
    }
    const totalNonKing =
      (pieceCount[color].p || 0) +
      (pieceCount[color].n || 0) +
      (pieceCount[color].b || 0) +
      (pieceCount[color].r || 0) +
      (pieceCount[color].q || 0);
    if (totalNonKing > 15) {
      reasons.push(`${color === 'w' ? 'White' : 'Black'} has ${totalNonKing} non-king pieces (max 15)`);
    }
  }

  // --- Castling rights must match king/rook placement ---
  // Free bonus check given we already have the parsed grid: a castling
  // flag is only meaningful if the relevant king and rook are still on
  // their home squares. (grid[rank][file]; rank 0 = rank 8, rank 7 = rank 1.)
  if (castling !== '-') {
    const requirement = {
      K: { king: [7, 4], rook: [7, 7], color: 'w' },
      Q: { king: [7, 4], rook: [7, 0], color: 'w' },
      k: { king: [0, 4], rook: [0, 7], color: 'b' },
      q: { king: [0, 4], rook: [0, 0], color: 'b' },
    };
    for (const flag of castling) {
      const req = requirement[flag];
      if (!req) {
        reasons.push(`Unrecognized castling flag "${flag}"`);
        continue;
      }
      const [kr, kf] = req.king;
      const [rr, rf] = req.rook;
      const kingOk = grid[kr][kf] && grid[kr][kf].type === 'k' && grid[kr][kf].color === req.color;
      const rookOk = grid[rr][rf] && grid[rr][rf].type === 'r' && grid[rr][rf].color === req.color;
      if (!kingOk || !rookOk) {
        reasons.push(`Castling flag "${flag}" is set but the required king/rook are not on their home squares`);
      }
    }
  }

  // --- Side not to move must not be in check ---
  // (If it were, the side to move could have captured the king on the
  // previous move, which is illegal — so this position could never occur.)
  // Only meaningful once we know there's exactly one king per side; skip if
  // an earlier check already found a king-count problem.
  if (kingCount.w === 1 && kingCount.b === 1) {
    const sideToMove = turn === 'b' ? 'b' : 'w';
    const opponent = sideToMove === 'w' ? 'b' : 'w';
    const opponentKing = kingSquare[opponent];
    if (isSquareAttackedBy(grid, opponentKing.rank, opponentKing.file, sideToMove)) {
      reasons.push(
        `Side not to move (${opponent === 'w' ? 'White' : 'Black'}) is in check — ` +
        `this position could not follow a legal move`
      );
    }
  }

  return { legal: reasons.length === 0, reasons };
}

module.exports = { checkSyntacticLegality, parseBoard };
