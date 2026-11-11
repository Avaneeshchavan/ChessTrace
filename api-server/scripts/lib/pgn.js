const fs = require('node:fs');
const readline = require('node:readline');
const { Chess } = require('chess.js');
const { computeStructuralVector, toPgvectorLiteral } = require('../../src/vector');

const TAG = /^\[(\w+)\s+"(.*)"\]\s*$/;
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const MAX_GAME_BYTES = 2 * 1024 * 1024;

async function* streamGames(file) {
  const input = typeof file === 'string' ? fs.createReadStream(file, { encoding: 'utf8' }) : file;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = {}, body = [], bytes = 0, inComment = false;
  try {
    for await (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('%')) continue;
      const tag = inComment ? null : line.match(TAG);
      if (tag && body.length) {
        yield { headers, body };
        headers = {}; body = []; bytes = 0;
      }
      bytes += Buffer.byteLength(raw) + 1;
      if (bytes > MAX_GAME_BYTES) throw new Error('PGN game exceeds 2 MiB; split or clean the input.');
      if (tag) headers[tag[1]] = tag[2];
      else {
        body.push(line);
        for (const c of line) {
          if (!inComment && c === ';') break;
          if (c === '{') inComment = true;
          if (c === '}') inComment = false;
        }
      }
    }
    if (body.length || Object.keys(headers).length) yield { headers, body };
  } finally {
    lines.close();
    input.destroy();
  }
}

function elo(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 4000 ? n : null;
}

function prepareGame({ headers, body }, { minElo = 0, completedOnly = false,
  maxPly = Infinity, vectorMinPly = 1, vectorMaxPly = Infinity, includeMovetext = false,
} = {}) {
  const whiteElo = elo(headers.WhiteElo), blackElo = elo(headers.BlackElo);
  if (minElo && ((whiteElo ?? 0) < minElo || (blackElo ?? 0) < minElo)) return null;
  if (completedOnly && !RESULTS.has(headers.Result)) return null;
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant)) return null;

  const tags = Object.entries(headers).map(([key, value]) => `[${key} "${value}"]`).join('\n');
  const movetext = body.join('\n');
  let pgn = `${tags}\n\n${movetext}`;
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (error) {
    // Lichess broadcasts can put evaluation, prose and clock in separate
    // adjacent comments on the same move. chess.js accepts one block.
    const joinedComments = movetext.replace(/\}\s*\{/g, ' ');
    // Its tag parser also treats an escaped straight quote as the end of
    // the tag value. Use a typographic quote inside that value for replay.
    const replayTags = tags.replace(/\\"/g, '”');
    if (joinedComments === movetext && replayTags === tags) throw error;
    pgn = `${replayTags}\n\n${joinedComments}`;
    chess.loadPgn(pgn);
  }
  const moves = chess.history({ verbose: true });
  if (!moves.length) return null;
  const positions = moves.slice(0, maxPly).map(({ after }, i) => ({
    halfMove: i + 1,
    fenCore: after.split(' ').slice(0, 3).join(' '),
    vector: i + 1 >= vectorMinPly && i + 1 <= vectorMaxPly
      ? toPgvectorLiteral(computeStructuralVector(after)) : null,
  }));
  const date = headers.Date?.replaceAll('.', '-');
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? new Date(date) : null;
  return {
    whiteName: headers.White || 'Unknown',
    blackName: headers.Black || 'Unknown',
    whiteElo, blackElo,
    playedAt: timestamp && Number.isFinite(timestamp.getTime()) && timestamp.toISOString().startsWith(date)
      ? timestamp.toISOString() : null,
    event: headers.Event || null,
    result: headers.Result || '*',
    pgn,
    legacyPgn: `${tags}\n\n${body.join(' ')}`,
    positions,
    ...(includeMovetext && { movetext: [moves[0].before.split(' ').slice(0, 4).join(' '), ...moves.map(move => move.lan)] }),
  };
}

module.exports = { streamGames, prepareGame };
