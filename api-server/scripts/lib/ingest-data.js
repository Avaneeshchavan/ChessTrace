const { performance } = require('node:perf_hooks');
const { streamGames, prepareGame } = require('./pgn');

function identifier(name) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Invalid schema name');
  return `"${name}"`;
}

async function writeBatch(db, schema, games, positionChunk) {
  if (!games.length) return { games: 0, positions: 0 };
  const s = identifier(schema);
  const unique = [...new Map(games.map(g => [g.legacyPgn, g])).values()];
  const input = JSON.stringify(unique.map(({ positions, ...g }) => g));
  const inputColumns = `"whiteName" text, "blackName" text, "whiteElo" int, "blackElo" int,
    "playedAt" timestamp, event text, result text, pgn text, "legacyPgn" text`;

  return db.$transaction(async tx => {
    // Serialize ingesters targeting the same schema; no production DDL or
    // unique-index migration is required on databases with historical duplicates.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${'chesstrace-ingest:' + schema}))`;
    const rows = await tx.$queryRawUnsafe(`
      WITH incoming AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(${inputColumns})),
      matched AS (
        SELECT i.*, (SELECT g.id FROM ${s}."Game" g
          WHERE g."whiteName" = i."whiteName" AND g."blackName" = i."blackName"
            AND (g.pgn = i.pgn OR g.pgn = i."legacyPgn")
          ORDER BY g.id LIMIT 1) AS id FROM incoming i
      ), inserted AS (
        INSERT INTO ${s}."Game" ("whiteName","blackName","whiteElo","blackElo","playedAt",event,result,pgn)
        SELECT "whiteName","blackName","whiteElo","blackElo","playedAt",event,result,pgn FROM matched WHERE id IS NULL
        RETURNING id,pgn
      )
      SELECT id,pgn,false AS inserted FROM matched WHERE id IS NOT NULL
      UNION ALL SELECT id,pgn,true FROM inserted`, input);
    const ids = new Map(rows.map(row => [row.pgn, row.id]));
    let positions = 0;
    let chunk = [];
    async function flush() {
      if (!chunk.length) return;
      positions += await tx.$executeRawUnsafe(`
        INSERT INTO ${s}."Position" ("gameId","halfMove","fenCore",vector)
        SELECT i."gameId",i."halfMove",i."fenCore",i.vector::vector
        FROM jsonb_to_recordset($1::jsonb) AS i("gameId" int,"halfMove" int,"fenCore" text,vector text)
        WHERE NOT EXISTS (SELECT 1 FROM ${s}."Position" p
          WHERE p."gameId" = i."gameId" AND p."halfMove" = i."halfMove")`, JSON.stringify(chunk));
      chunk = [];
    }
    const seenIds = new Set();
    for (const game of unique) {
      const gameId = ids.get(game.pgn);
      if (seenIds.has(gameId)) continue;
      seenIds.add(gameId);
      for (const position of game.positions) {
        chunk.push({ gameId, ...position });
        if (chunk.length >= positionChunk) await flush();
      }
    }
    await flush();
    return { games: rows.filter(row => row.inserted).length, positions };
  }, { timeout: 120_000, maxWait: 15_000 });
}

async function ingestFile(db, file, {
  schema = 'public', batchSize = 25, positionChunk = 4000, limit = Infinity,
  start = 0, minElo = 0, completedOnly = false, checkpoint = async () => {},
  log = console.log,
} = {}) {
  const totals = { scanned: start, games: 0, positions: 0, skipped: 0, duplicates: 0 };
  let ordinal = 0, sinceCommit = 0, batch = [];
  const began = performance.now();
  async function commit() {
    if (!sinceCommit) return;
    const written = await writeBatch(db, schema, batch, positionChunk);
    totals.games += written.games;
    totals.positions += written.positions;
    totals.duplicates += batch.length - written.games;
    totals.scanned = ordinal;
    await checkpoint(ordinal);
    const seconds = (performance.now() - began) / 1000;
    log(`scanned=${ordinal} inserted=${totals.games} positions=${totals.positions} skipped=${totals.skipped} duplicates=${totals.duplicates} positions/s=${Math.round(totals.positions / Math.max(seconds, 0.001))}`);
    batch = [];
    sinceCommit = 0;
  }
  for await (const raw of streamGames(file)) {
    if (++ordinal <= start) continue;
    sinceCommit++;
    let game;
    try { game = prepareGame(raw, { minElo, completedOnly }); }
    catch (error) {
      if (totals.skipped < 5) log(`Skipping malformed game #${ordinal}: ${error.message.split('\n')[0]}`);
    }
    if (game) batch.push(game);
    else totals.skipped++;
    if (sinceCommit >= batchSize || batch.length >= limit - totals.games) await commit();
    if (totals.games >= limit) break;
  }
  await commit();
  return totals;
}

module.exports = { identifier, ingestFile };
