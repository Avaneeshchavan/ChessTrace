// ChessTrace - Structural similarity vector
//
// Produces a fixed-length (32-dimensional) numeric signature for a position,
// designed so that two positions with a "similar tactical situation around
// the kings" end up close together in vector space, even if the exact board
// (and therefore the exact fenCore hash) is completely different.
//
// See EXPLANATION.md section 1 for the full design rationale. Short version:
// full-board hashing only matches byte-identical positions, which is nearly
// useless for finding "other instances of this kind of attack" — the same
// mating net can arise from hundreds of different move orders and piece
// placements elsewhere on the board. This vector throws away everything
// except the few features that actually determine king safety and rough
// material state, so unrelated squares (irrelevant piece placement) stop
// creating false differences.
//
// VECTOR LAYOUT (32 floats, all pre-normalized to roughly [-1, 1]):
//   [0..7]   White king's 8 zone squares (occupancy), fixed compass order:
//            N, NE, E, SE, S, SW, W, NW (squares off the board are 0)
//   [8..15]  Black king's 8 zone squares, same compass order
//   [16..18] White king pawn shield: 3 squares directly "in front" of the
//            king (from White's perspective, one rank up), left/center/right
//   [19..21] Black king pawn shield, mirrored (one rank down)
//   [22]     Attackers on White king's zone (count of Black moves landing there)
//   [23]     Defenders of White king's zone (count of White moves landing there)
//   [24]     Attackers on Black king's zone (count of White moves landing there)
//   [25]     Defenders of Black king's zone (count of Black moves landing there)
//   [26..30] Material diff (White - Black) per type: pawn, knight, bishop, rook, queen
//   [31]     Total weighted material diff (White - Black)
//
// APPROXIMATION NOTE: "attackers/defenders" are computed with our own
// geometric attack-map function (see isSquareAttackedBy below), not by
// asking chess.js for legal moves. An earlier version of this file tried
// the legal-moves approach (temporarily flipping whose turn it is, then
// calling chess.moves()) — that's wrong in a way that specifically breaks
// on tactical positions: chess.js's FEN validator rejects any position
// where the side NOT to move is in check, and flipping the turn field
// turns "side to move is in check" (completely normal — it just means
// someone is giving check) into "side not to move is in check" (invalid),
// causing a thrown exception on exactly the check/tactical positions this
// vector is meant to describe well. Pure geometric attack detection (does
// piece X on square A threaten square B, ignoring whose turn it is and
// ignoring pins) sidesteps this entirely and is also simply the more
// standard definition of "attacked square" used in chess engines.

const { Chess } = require('chess.js');
const { countAttackersOnSquares: countAttackers } = require('./attacks');

const PIECE_CODE = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
const MATERIAL_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const COMPASS_OFFSETS = [
  [-1, 0],  // N  (rank + 1)
  [-1, 1],  // NE
  [0, 1],   // E
  [1, 1],   // SE
  [1, 0],   // S  (rank - 1)
  [1, -1],  // SW
  [0, -1],  // W
  [-1, -1], // NW
];

function squareToRankFile(square) {
  // chess.js square strings like "e4" -> { rankIdx (0=rank8..7=rank1), fileIdx (0=a..7=h) }
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - Number(square[1]);
  return { rank, file };
}

function rankFileToSquare(rank, file) {
  if (rank < 0 || rank > 7 || file < 0 || file > 7) return null;
  return String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank);
}

/** Returns the up-to-8 valid zone squares around a king square (board-edge squares omitted). */
function zoneSquares(kingSquare) {
  const { rank, file } = squareToRankFile(kingSquare);
  return COMPASS_OFFSETS.map(([dr, df]) => rankFileToSquare(rank + dr, file + df));
}

/** Encodes a zone square's occupant relative to `ownColor`: +val if own piece, -val if enemy, 0 if empty/off-board. */
function encodeOccupancy(chess, square, ownColor) {
  if (!square) return 0;
  const piece = chess.get(square);
  if (!piece) return 0;
  const code = PIECE_CODE[piece.type];
  return piece.color === ownColor ? code / 6 : -code / 6; // normalize by king's code (max value)
}

/** Pawn shield: 3 squares one rank "ahead" of the king (toward the enemy). */
function pawnShield(chess, kingSquare, color) {
  const { rank, file } = squareToRankFile(kingSquare);
  const dr = color === 'w' ? -1 : 1; // White's "ahead" is rank+1 => lower rankIdx
  const squares = [
    rankFileToSquare(rank + dr, file - 1),
    rankFileToSquare(rank + dr, file),
    rankFileToSquare(rank + dr, file + 1),
  ];
  return squares.map((sq) => {
    if (!sq) return 0;
    const piece = chess.get(sq);
    return piece && piece.type === 'p' && piece.color === color ? 1 : 0;
  });
}

/** Counts how many of `squares` are attacked by `color`, using the shared geometric attack map. */
function countAttackersOnSquares(grid, color, squares) {
  return countAttackers(grid, color, squares, squareToRankFile);
}

/**
 * Computes the 32-dimensional structural similarity vector for a position.
 * @param {string} fen Full 6-field FEN (or fenCore padded to a full FEN).
 * @returns {number[]} length-32 array of floats
 */
function computeStructuralVector(fen) {
  const chess = new Chess(fen);
  const board = chess.board(); // 8x8 array, used to locate kings + count material

  let whiteKingSq = null;
  let blackKingSq = null;
  const material = { w: {}, b: {} };

  board.forEach((row) => {
    row.forEach((piece) => {
      if (!piece) return;
      if (piece.type === 'k') {
        if (piece.color === 'w') whiteKingSq = piece.square;
        else blackKingSq = piece.square;
      } else {
        material[piece.color][piece.type] = (material[piece.color][piece.type] || 0) + 1;
      }
    });
  });

  if (!whiteKingSq || !blackKingSq) {
    throw new Error('Position is missing a king; cannot compute structural vector');
  }

  const vec = new Array(32).fill(0);

  // [0..7] White king zone occupancy
  const wZone = zoneSquares(whiteKingSq);
  wZone.forEach((sq, i) => { vec[i] = encodeOccupancy(chess, sq, 'w'); });

  // [8..15] Black king zone occupancy
  const bZone = zoneSquares(blackKingSq);
  bZone.forEach((sq, i) => { vec[8 + i] = encodeOccupancy(chess, sq, 'b'); });

  // [16..18] White pawn shield, [19..21] Black pawn shield
  const wShield = pawnShield(chess, whiteKingSq, 'w');
  const bShield = pawnShield(chess, blackKingSq, 'b');
  wShield.forEach((v, i) => { vec[16 + i] = v; });
  bShield.forEach((v, i) => { vec[19 + i] = v; });

  // [22..25] Attackers / defenders on each king's zone, normalized by 8
  // (there are at most 8 zone squares, so this is also a natural count cap
  // per square-attacked-or-not; a square attacked by multiple pieces still
  // only contributes to the squares-attacked tally once per square here,
  // which keeps the feature's scale stable and comparable across positions).
  vec[22] = countAttackersOnSquares(board, 'b', wZone) / 8;
  vec[23] = countAttackersOnSquares(board, 'w', wZone) / 8;
  vec[24] = countAttackersOnSquares(board, 'w', bZone) / 8;
  vec[25] = countAttackersOnSquares(board, 'b', bZone) / 8;

  // [26..30] Material diff per type (White - Black), normalized by a
  // generous max plausible count (2 original + up to 8 promoted = 10,
  // except queen which we cap the normalizer at 9 for scale sanity).
  const types = ['p', 'n', 'b', 'r', 'q'];
  const typeNorm = { p: 8, n: 10, b: 10, r: 10, q: 9 };
  types.forEach((t, i) => {
    const diff = (material.w[t] || 0) - (material.b[t] || 0);
    vec[26 + i] = diff / typeNorm[t];
  });

  // [31] Total weighted material diff, normalized by ~39 (one side's full
  // non-king, non-pawn-promoted starting material: 2*3+2*3+2*5+1*9=38, plus pawns=8 => 46;
  // we use 46 as the normalizer for headroom).
  let totalDiff = 0;
  for (const t of types) {
    totalDiff += ((material.w[t] || 0) - (material.b[t] || 0)) * MATERIAL_VALUE[t];
  }
  vec[31] = totalDiff / 46;

  return vec;
}

/** Formats a JS number array as a pgvector literal string, e.g. "[0.1,-0.2,...]". */
function toPgvectorLiteral(vec) {
  return `[${vec.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`;
}

module.exports = { computeStructuralVector, toPgvectorLiteral, zoneSquares };
