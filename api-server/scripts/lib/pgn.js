const fs = require('node:fs');
const readline = require('node:readline');
const { Chess } = require('chess.js');
const { computeStructuralVector, toPgvectorLiteral } = require('../../src/vector');

const TAG = /^\[(\w+)\s+"(.*)"\]\s*$/;
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const MAX_GAME_BYTES = 2 * 1024 * 1024;

async function* streamGames(file) {
  const input = fs.createReadStream(file, { encoding: 'utf8' });
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

function prepareGame({ headers, body }, { minElo = 0, completedOnly = false } = {}) {
  const whiteElo = elo(headers.WhiteElo), blackElo = elo(headers.BlackElo);
  if (minElo && ((whiteElo ?? 0) < minElo || (blackElo ?? 0) < minElo)) return null;
  if (completedOnly && !RESULTS.has(headers.Result)) return null;
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant)) return null;

  const tags = Object.entries(headers).map(([key, value]) => `[${key} "${value}"]`).join('\n');
  const pgn = `${tags}\n\n${body.join('\n')}`;
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history({ verbose: true });
  if (!moves.length) return null;
  const positions = moves.map(({ after }, i) => ({
    halfMove: i + 1,
    fenCore: after.split(' ').slice(0, 3).join(' '),
    vector: toPgvectorLiteral(computeStructuralVector(after)),
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
  };
}

module.exports = { streamGames, prepareGame };
