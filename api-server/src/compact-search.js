const { gunzipSync } = require('node:zlib');
const { positionKey, verifiesPosition } = require('./compact-position');
const { computeStructuralVector, toPgvectorLiteral } = require('./vector');
const { storageProfile } = require('../config/storage');

function gamePgn(row) {
  return row.pgn_gzip ? gunzipSync(row.pgn_gzip).toString('utf8') : row.pgn;
}

function verifiedRows(rows, project) {
  const cache = new Map();
  return rows.flatMap(row => {
    if (positionKey(row.fenCore) !== row.key) return [];
    let pgn;
    try { pgn = gamePgn(row); }
    catch { return []; }
    return verifiesPosition(pgn, row.halfMove, row.fenCore, cache) ? [project(row, pgn)] : [];
  });
}

async function findCompactExact(prisma, fenCore) {
  const rows = await prisma.$queryRaw`
    SELECT p.key, p.fen_core AS "fenCore", pg.ply AS "halfMove", g.*, cg.pgn_gzip
    FROM position_v2 p JOIN position_game pg USING (key)
    JOIN compact_game cg USING (game_id) JOIN "Game" g ON g.id = cg.game_id
    WHERE p.key = ${positionKey(fenCore)} AND p.fen_core = ${fenCore}
    ORDER BY (g."whiteElo" + g."blackElo") DESC NULLS LAST, g."playedAt" DESC NULLS LAST, g.id
    LIMIT 100`;
  return verifiedRows(rows, ({ key, fenCore, halfMove, pgn_gzip, ...game }, pgn) => ({
    id: `${key}:${game.id}`, gameId: game.id, halfMove, fenCore, game: { ...game, pgn },
  }));
}

async function findCompactSimilar(prisma, fullFen, limit, { opening = '', era = null, efSearch = 40 } = {}) {
  const filtered = opening || era !== null;
  const candidateLimit = filtered ? storageProfile().annCandidateLimit : limit;
  const vector = toPgvectorLiteral(computeStructuralVector(fullFen));
  const [, rows] = await prisma.$transaction([
    prisma.$queryRaw`SELECT set_config('hnsw.ef_search', ${String(filtered ? candidateLimit : efSearch)}, true)`,
    prisma.$queryRaw`
      WITH nearest AS MATERIALIZED (
        SELECT key, fen_core, vector <-> ${vector}::halfvec AS distance
        FROM position_v2 WHERE vector IS NOT NULL
        ORDER BY vector <-> ${vector}::halfvec LIMIT ${candidateLimit}
      )
      SELECT n.key, n.fen_core AS "fenCore", n.distance, g.*
      FROM nearest n
      CROSS JOIN LATERAL (
        SELECT g.id AS "gameId", pg.ply AS "halfMove", g."whiteName", g."blackName",
          g.event, g.result, g."playedAt", g.pgn, cg.pgn_gzip, cg.opening, cg.eco, cg.start_fen AS "startFen"
        FROM position_game pg JOIN compact_game cg USING (game_id)
        JOIN "Game" g ON g.id = pg.game_id
        WHERE pg.key = n.key
          AND (${opening}::text = '' OR strpos(lower(coalesce(cg.opening, '')), lower(${opening})) > 0
            OR starts_with(lower(coalesce(cg.eco, '')), lower(${opening})))
          AND (${era}::int IS NULL OR extract(year FROM g."playedAt") >= ${era}::int
            AND extract(year FROM g."playedAt") < ${era}::int + 10)
        ORDER BY (g."whiteElo" + g."blackElo") DESC NULLS LAST, g."playedAt" DESC NULLS LAST, g.id
        LIMIT 1
      ) g
      ORDER BY n.distance, n.key LIMIT ${limit}`,
  ]);
  return verifiedRows(rows, ({ key, pgn, pgn_gzip, ...row }) => ({ id: `${key}:${row.gameId}`, ...row }));
}

async function findCompactGame(prisma, id) {
  const [row] = await prisma.$queryRaw`
    SELECT g.pgn, cg.pgn_gzip FROM "Game" g
    LEFT JOIN compact_game cg ON cg.game_id = g.id WHERE g.id = ${id}::int`;
  return row ? { pgn: gamePgn(row) } : null;
}

module.exports = { findCompactExact, findCompactSimilar, findCompactGame };
