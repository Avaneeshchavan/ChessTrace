const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { performance } = require('node:perf_hooks');
const { positionKey } = require('../../src/compact-position');
const { streamGames, prepareGame } = require('./pgn');

async function writeCompactBatch(db, games, profile) {
  if (!games.length) return { games: 0, positions: 0 };
  const unique = new Map(games.map(game => [
    createHash('sha256').update(game.pgn).digest('hex'), game,
  ]));

  return db.$transaction(async tx => {
    // Serialize deduplication, counts and cap pruning in this corpus schema.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(current_schema() || ':compact-corpus'))`;
    const [{ lz4 }] = await tx.$queryRaw`SELECT coalesce(to_jsonb(a)->>'attcompression' = 'l', false) AS lz4
      FROM pg_attribute a WHERE attrelid = '"Game"'::regclass AND attname = 'pgn'`;
    const input = [...unique].map(([hash, { positions, legacyPgn, headers, ...game }]) => ({
      ...game, hash, opening: headers.Opening, eco: /^[A-E]\d{2}$/.test(headers.ECO) ? headers.ECO : null,
      startFen: headers.FEN,
      gzip: lz4 ? null : gzipSync(game.pgn).toString('base64'),
      pgn: lz4 ? game.pgn : '',
    }));

    const inserted = await tx.$queryRaw`
      WITH incoming AS MATERIALIZED (
        SELECT nextval(pg_get_serial_sequence('"Game"', 'id'))::int AS id, i.*
        FROM jsonb_to_recordset(${JSON.stringify(input)}::jsonb) AS i(
          hash text, "whiteName" text, "blackName" text, "whiteElo" int, "blackElo" int,
          "playedAt" timestamp, event text, result text, pgn text, gzip text,
          opening text, eco text, "startFen" text)
        WHERE NOT EXISTS (SELECT 1 FROM compact_game cg WHERE cg.pgn_hash = decode(i.hash, 'hex'))
      ), inserted_games AS (
        INSERT INTO "Game" (id,"whiteName","blackName","whiteElo","blackElo","playedAt",event,result,pgn)
        SELECT id,"whiteName","blackName","whiteElo","blackElo","playedAt",event,result,pgn FROM incoming
        RETURNING id
      )
      INSERT INTO compact_game (game_id,pgn_hash,pgn_gzip,opening,eco,start_fen)
      SELECT id,decode(hash,'hex'),decode(gzip,'base64'),opening,eco,"startFen"
      FROM incoming JOIN inserted_games USING (id)
      RETURNING game_id,encode(pgn_hash,'hex') AS hash`;

    const positions = [];
    const cores = new Map();
    for (const { game_id: gameId, hash } of inserted) {
      for (const { fenCore, halfMove, vector } of unique.get(hash).positions) {
        const key = positionKey(fenCore).toString();
        if (cores.has(key) && cores.get(key) !== fenCore) {
          throw new Error('Compact position key collision within import batch');
        }
        cores.set(key, fenCore);
        positions.push({ key, gameId, ply: halfMove, fenCore, vector });
      }
    }
    if (!positions.length) return { games: inserted.length, positions: 0 };
    const rows = JSON.stringify(positions);
    const written = await tx.$executeRaw`
      INSERT INTO position_v2 (key,fen_core,games_count,vector)
      SELECT key,"fenCore",count(DISTINCT "gameId"),min(vector)::halfvec(32)
      FROM jsonb_to_recordset(${rows}::jsonb) AS p(key bigint,"fenCore" text,"gameId" int,vector text)
      GROUP BY key,"fenCore"
      ON CONFLICT (key) DO UPDATE
        SET games_count = position_v2.games_count + excluded.games_count,
          vector = coalesce(position_v2.vector, excluded.vector)
        WHERE position_v2.fen_core = excluded.fen_core`;
    if (written !== cores.size) throw new Error('Compact position key collision with stored corpus');

    await tx.$executeRaw`
      INSERT INTO position_game (key,game_id,ply)
      SELECT key,"gameId",min(ply)
      FROM jsonb_to_recordset(${rows}::jsonb) AS p(key bigint,"gameId" int,ply smallint)
      GROUP BY key,"gameId"`;
    await tx.$executeRaw`
      WITH affected AS (SELECT DISTINCT unnest(${[...cores.keys()].map(BigInt)}::bigint[]) AS key),
      ranked AS (
        SELECT pg.key, pg.game_id, row_number() OVER (
          PARTITION BY pg.key ORDER BY (g."whiteElo" + g."blackElo") DESC NULLS LAST,
          g."playedAt" DESC NULLS LAST, g.id
        ) AS rank
        FROM affected JOIN position_game pg USING (key) JOIN "Game" g ON g.id = pg.game_id
      )
      DELETE FROM position_game pg USING ranked r
      WHERE pg.key = r.key AND pg.game_id = r.game_id AND r.rank > ${profile.occurrenceCap}`;
    return { games: inserted.length, positions: positions.length };
  }, { timeout: 120_000 });
}

async function ingestCompactFile(db, file, profile, { limit, batchSize = 100 }) {
  const totals = { games: 0, positions: 0, scanned: 0, skipped: 0, malformed: 0 };
  const began = performance.now();
  let batch = [];
  async function flush() {
    const written = await writeCompactBatch(db, batch, profile);
    totals.games += written.games;
    totals.positions += written.positions;
    batch = [];
  }
  for await (const raw of streamGames(file)) {
    totals.scanned++;
    let game;
    try {
      game = prepareGame(raw, { ...profile, minElo: profile.minRating, completedOnly: true });
    } catch (error) {
      if (++totals.malformed <= 5) console.error(`Skipping game ${totals.scanned}: ${error.message.split('\n')[0]}`);
    }
    if (!game) {
      totals.skipped++;
      continue;
    }
    batch.push({ ...game, headers: raw.headers });
    if (batch.length >= Math.min(batchSize, limit - totals.games)) await flush();
    if (totals.games >= limit) break;
  }
  await flush();
  return { ...totals, seconds: (performance.now() - began) / 1000 };
}

module.exports = { writeCompactBatch, ingestCompactFile };
