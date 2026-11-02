#!/usr/bin/env node
// ChessTrace - Ingestion pipeline
//
// Usage: node scripts/ingest.js <path-to-pgn-file>
// Optional flags:
//   --expose-gc (Node flag, not ours) lets us force a GC pass between chunks
//   e.g.  node --expose-gc scripts/ingest.js games.pgn
//
// WHAT THIS DOES
//   1. Streams the PGN file line-by-line (never holds the whole file in
//      memory) and groups lines into individual games.
//   2. Batches ~300 games at a time and bulk-inserts the Game rows via a
//      single multi-row `INSERT ... RETURNING id` (see EXPLANATION.md
//      section 4 for why this can't just be `prisma.game.createMany`).
//   3. For each game in that batch (now that we know its database id),
//      replays every move with chess.js, computing fenCore + the
//      structural vector at each half-move.
//   4. Buffers Position rows and flushes them in chunks of ~8,000 via a
//      raw multi-row INSERT once the buffer is full — chunking keeps each
//      round-trip's payload and transaction time within Neon free-tier
//      limits, and keeps the buffer array from growing unbounded.
//
// WHY RAW SQL INSTEAD OF prisma.position.createMany
//   The `vector` column is declared in schema.prisma as
//   `Unsupported("vector(32)")`. Prisma deliberately does not let you read
//   or write "Unsupported" columns through the normal Client API (createMany
//   included) — there's no type-safe way for it to represent a pgvector
//   value. So bulk-writing positions has to go through `$executeRawUnsafe`
//   regardless of performance; COPY/createMany speed was never actually an
//   option here once a vector column is involved. This script uses
//   parameterized multi-row INSERT statements (not literal string
//   interpolation) to stay injection-safe.

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Chess } = require('chess.js');
const { computeStructuralVector, toPgvectorLiteral } = require('../src/vector');

const GAME_BATCH_SIZE = 300;      // games inserted (and id-fetched) per round-trip
const POSITION_CHUNK_SIZE = 8000; // position rows per bulk insert
const LOG_EVERY_GAMES = 1000;

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// PGN parsing (streaming, one game at a time)
// ---------------------------------------------------------------------------

const HEADER_RE = /^\[(\w+)\s+"(.*)"\]\s*$/;

/**
 * Async generator that yields one raw parsed game object per PGN game found
 * in the file, without ever holding the full file in memory. Only the
 * current game's lines are buffered at once.
 */
async function* streamGames(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = {};
  let movetextLines = [];
  let inMovetext = false;

  function hasPendingGame() {
    return movetextLines.length > 0 || Object.keys(headers).length > 0;
  }

  function finalizeGame() {
    const game = { headers, movetext: movetextLines.join(' ') };
    headers = {};
    movetextLines = [];
    inMovetext = false;
    return game;
  }

  for await (const rawLine of rl) {
    const line = rawLine.trim();

    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      // A header line arriving after movetext has already started means the
      // previous game had no trailing blank line — finalize it first.
      if (inMovetext && movetextLines.length > 0) {
        yield finalizeGame();
      }
      headers[headerMatch[1]] = headerMatch[2];
      continue;
    }

    if (line.length === 0) {
      if (inMovetext && movetextLines.length > 0) {
        yield finalizeGame();
      }
      continue;
    }

    inMovetext = true;
    movetextLines.push(line);
  }

  if (hasPendingGame()) {
    yield finalizeGame();
  }
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** Strips comments, variations, NAGs, move numbers, and the result token, returning a plain SAN move array. */
function extractSanMoves(movetext) {
  let text = movetext;
  text = text.replace(/\{[\s\S]*?\}/g, ' ');       // {comments}
  text = text.replace(/\$\d+/g, ' ');              // NAGs like $16

  // Strip balanced (...) variations. Movetext variations aren't deeply
  // nested in the vast majority of real-world game databases, so a simple
  // iterative strip is sufficient here; pathological inputs would just
  // leave some variation text behind, which chess.move() will then reject
  // and the game gets skipped (see replayGame).
  let prev;
  do {
    prev = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  } while (text !== prev);

  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens
    .filter((tok) => {
      if (RESULT_TOKENS.has(tok)) return false;
      if (/^\d+\.+$/.test(tok)) return false; // pure move-number token, e.g. "12." or "12..."
      return true;
    })
    .map((tok) => tok.replace(/^\d+\.+/, '')); // strip a glued move number, e.g. "12.e4" -> "e4"
}

function parseEloOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDateOrNull(value) {
  // PGN dates look like "2023.05.14"; unknown components are "??".
  if (!value || value.includes('??')) return null;
  const [y, m, d] = value.split('.').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ---------------------------------------------------------------------------
// Move replay -> fenCore + vector per half-move
// ---------------------------------------------------------------------------

function deriveFenCore(fullFen) {
  const [placement, turn, castling] = fullFen.split(' ');
  return `${placement} ${turn} ${castling}`;
}

/**
 * Replays a game's SAN moves and returns an array of
 * { halfMove, fenCore, vector } rows. Returns null (and logs a warning) if
 * the movetext doesn't replay cleanly — we skip malformed games rather than
 * inserting a partial/incorrect position history.
 */
function replayGame(sanMoves, gameLabel) {
  const chess = new Chess();
  const rows = [];
  for (let i = 0; i < sanMoves.length; i += 1) {
    const san = sanMoves[i];
    let move;
    try {
      move = chess.move(san, { strict: false });
    } catch (err) {
      move = null;
    }
    if (!move) {
      console.warn(`[skip] ${gameLabel}: illegal/unparseable move "${san}" at half-move ${i + 1}`);
      return null;
    }
    const fullFen = chess.fen();
    const fenCore = deriveFenCore(fullFen);
    let vector;
    try {
      vector = computeStructuralVector(fullFen);
    } catch (err) {
      console.warn(`[skip] ${gameLabel}: vector computation failed at half-move ${i + 1}: ${err.message}`);
      return null;
    }
    rows.push({ halfMove: i + 1, fenCore, vector });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Bulk insert helpers (raw SQL, parameterized)
// ---------------------------------------------------------------------------

async function insertGameBatchReturningIds(batch) {
  // batch: array of { whiteName, blackName, whiteElo, blackElo, playedAt, event, result, pgn }
  const columns = ['whiteName', 'blackName', 'whiteElo', 'blackElo', 'playedAt', 'event', 'result', 'pgn'];
  const values = [];
  const placeholders = batch.map((g, rowIdx) => {
    const base = rowIdx * columns.length;
    values.push(g.whiteName, g.blackName, g.whiteElo, g.blackElo, g.playedAt, g.event, g.result, g.pgn);
    const rowPlaceholders = columns.map((_, colIdx) => `$${base + colIdx + 1}`).join(', ');
    return `(${rowPlaceholders})`;
  });

  const sql = `
    INSERT INTO "Game" ("whiteName","blackName","whiteElo","blackElo","playedAt","event","result","pgn")
    VALUES ${placeholders.join(', ')}
    RETURNING id
  `;
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return rows.map((r) => r.id);
}

async function flushPositionChunk(chunk) {
  if (chunk.length === 0) return;
  const columns = ['gameId', 'halfMove', 'fenCore', 'vector'];
  const values = [];
  const placeholders = chunk.map((p, rowIdx) => {
    const base = rowIdx * columns.length;
    values.push(p.gameId, p.halfMove, p.fenCore, toPgvectorLiteral(p.vector));
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`;
  });

  const sql = `
    INSERT INTO "Position" ("gameId","halfMove","fenCore","vector")
    VALUES ${placeholders.join(', ')}
  `;
  await prisma.$executeRawUnsafe(sql, ...values);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function logMemory(label) {
  const mem = process.memoryUsage();
  const mb = (n) => Math.round(n / 1024 / 1024);
  console.log(`[mem:${label}] rss=${mb(mem.rss)}MB heapUsed=${mb(mem.heapUsed)}MB external=${mb(mem.external)}MB`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/ingest.js <path-to-pgn-file>');
    process.exit(1);
  }
  const resolvedPath = path.resolve(filePath);

  let gameBatch = [];        // raw headers + movetext, awaiting id assignment
  let positionBuffer = [];   // rows awaiting flush, all with a real gameId
  let gamesProcessed = 0;
  let gamesSkipped = 0;

  async function processGameBatch() {
    if (gameBatch.length === 0) return;

    const gameRowsForInsert = gameBatch.map((g) => ({
      whiteName: g.headers.White || 'Unknown',
      blackName: g.headers.Black || 'Unknown',
      whiteElo: parseEloOrNull(g.headers.WhiteElo),
      blackElo: parseEloOrNull(g.headers.BlackElo),
      playedAt: parseDateOrNull(g.headers.Date),
      event: g.headers.Event || null,
      result: g.headers.Result || '*',
      pgn: `${Object.entries(g.headers).map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${g.movetext}`,
    }));

    const ids = await insertGameBatchReturningIds(gameRowsForInsert);

    for (let i = 0; i < gameBatch.length; i += 1) {
      const gameId = ids[i];
      const sanMoves = extractSanMoves(gameBatch[i].movetext);
      const label = `${gameRowsForInsert[i].whiteName} vs ${gameRowsForInsert[i].blackName}`;
      const rows = replayGame(sanMoves, label);

      if (rows === null) {
        gamesSkipped += 1;
        continue;
      }

      for (const r of rows) {
        positionBuffer.push({ gameId, halfMove: r.halfMove, fenCore: r.fenCore, vector: r.vector });
      }

      gamesProcessed += 1;
      if (gamesProcessed % LOG_EVERY_GAMES === 0) {
        console.log(`Processed ${gamesProcessed} games (${gamesSkipped} skipped)...`);
        logMemory(`after-${gamesProcessed}-games`);
      }

      while (positionBuffer.length >= POSITION_CHUNK_SIZE) {
        const chunk = positionBuffer.splice(0, POSITION_CHUNK_SIZE);
        await flushPositionChunk(chunk);
        // Explicit chunk drop + optional forced GC keeps resident memory
        // roughly flat regardless of how many games/positions remain,
        // which is the point of streaming in the first place.
        if (global.gc) global.gc();
      }
    }

    gameBatch = [];
  }

  console.log(`Starting ingestion of ${resolvedPath}`);
  logMemory('start');

  for await (const rawGame of streamGames(resolvedPath)) {
    gameBatch.push(rawGame);
    if (gameBatch.length >= GAME_BATCH_SIZE) {
      await processGameBatch();
    }
  }
  await processGameBatch(); // flush any remaining partial batch

  // Final flush of whatever's left in the position buffer.
  if (positionBuffer.length > 0) {
    await flushPositionChunk(positionBuffer);
    positionBuffer = [];
  }

  logMemory('end');
  console.log(`Done. Games inserted: ${gamesProcessed}, games skipped: ${gamesSkipped}.`);
}

main()
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
