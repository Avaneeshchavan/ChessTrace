const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');

function fenCore(fen) {
  return fen.trim().split(/\s+/, 3).join(' ');
}

function positionKey(fen) {
  return createHash('sha256').update(fenCore(fen)).digest().readBigInt64BE();
}

function replayMoves(pgn, cache) {
  if (!cache.has(pgn)) {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      cache.set(pgn, chess.history({ verbose: true }));
    } catch {
      cache.set(pgn, []);
    }
  }
  return cache.get(pgn);
}

function verifiesPosition(pgn, ply, expected, cache) {
  const move = replayMoves(pgn, cache)[ply - 1];
  return Boolean(move && fenCore(move.after) === expected);
}

function replayPositionDetails(pgn, ply, cache) {
  const moves = replayMoves(pgn, cache);
  const current = moves[ply - 1];
  if (!current) return {};
  return { nextMove: moves[ply]?.san, positionMove: Number(current.before.split(' ')[5]) };
}

module.exports = { fenCore, positionKey, verifiesPosition, replayPositionDetails };
