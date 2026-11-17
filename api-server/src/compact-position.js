const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');

function fenCore(fen) {
  return fen.trim().split(/\s+/, 3).join(' ');
}

function positionKey(fen) {
  return createHash('sha256').update(fenCore(fen)).digest().readBigInt64BE();
}

function verifiesPosition(pgn, ply, expected, cache) {
  if (!cache.has(pgn)) {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      cache.set(pgn, chess.history({ verbose: true }).map(move => fenCore(move.after)));
    } catch {
      cache.set(pgn, []);
    }
  }
  return cache.get(pgn)[ply - 1] === expected;
}

module.exports = { fenCore, positionKey, verifiesPosition };
