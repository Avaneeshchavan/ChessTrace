// ChessTrace - Two-tier search module
//
// Tier 1 (findExactMatch): hash-index lookup on fenCore. O(1)-class, exact.
// Tier 2 (findSimilarPositions): pgvector HNSW approximate nearest-neighbor
//   search over the structural signature from src/vector.js. Used whenever
//   Tier 1 returns nothing, or whenever the caller explicitly wants "similar
//   tactical situations" rather than a byte-identical board.
//
// Both functions take a PrismaClient instance so this module has no global
// state and is easy to test / reuse from the ingestion script or a future
// API layer.

const { computeStructuralVector, toPgvectorLiteral } = require('./vector');

/**
 * Pads a fenCore (board + turn + castling) back into a full 6-field FEN
 * that chess.js will accept, using neutral placeholder values for the
 * fields we deliberately don't store (en passant target, halfmove clock,
 * fullmove number). Those fields don't affect the structural vector.
 */
function fenCoreToFullFen(fenCore) {
  const parts = fenCore.trim().split(/\s+/);
  const [placement, turn = 'w', castling = '-'] = parts;
  return `${placement} ${turn} ${castling} - 0 1`;
}

/**
 * Tier 1: exact-match search.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} fenCore
 * @returns {Promise<Array>} matching Position rows, each with its parent Game
 */
async function findExactMatch(prisma, fenCore) {
  return prisma.position.findMany({
    where: { fenCore },
    include: { game: true },
    take: 100, // sane upper bound; a hash hit could still be common in the opening
  });
}

/**
 * Tier 2: approximate nearest-neighbor search over the structural vector.
 * Computes the vector for the given fenCore on the fly (cheap — a handful
 * of chess.js calls), then asks pgvector for the closest stored vectors by
 * Euclidean (L2) distance using the HNSW index defined in
 * prisma/migrations/0001_manual_vector_index/migration.sql.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} fenCore
 * @param {number} limit
 * @param {{ efSearch?: number }} [options] efSearch trades recall for speed
 *   (higher = more accurate, slower). Default 40 is a reasonable starting
 *   point at our data scale; tune based on measured recall.
 * @returns {Promise<Array<{ id: string, gameId: number, halfMove: number, fenCore: string, distance: number }>>}
 */
async function findSimilarPositions(prisma, fenCore, limit = 10, options = {}) {
  const opening = options.opening ?? '';
  const era = options.era ?? null;
  const filtered = Boolean(opening || era !== null);
  const candidateLimit = filtered ? 1000 : limit;
  const efSearch = filtered ? 1000 : (options.efSearch ?? 40);
  const fullFen = fenCoreToFullFen(fenCore);
  const vecLiteral = toPgvectorLiteral(computeStructuralVector(fullFen));

  // Find nearest positions before joining game metadata, so PostgreSQL can use
  // the HNSW ordering. Optional filters use a bounded wider candidate pool.
  const rows = await prisma.$transaction([
    prisma.$queryRaw`SELECT set_config('hnsw.ef_search', ${String(efSearch)}, true)`,
    prisma.$queryRawUnsafe(
      `
      WITH nearest AS MATERIALIZED (
        SELECT p.id, p."gameId", p."halfMove", p."fenCore", p.vector <-> $1::vector AS distance
        FROM "Position" p
        WHERE p.vector IS NOT NULL
        ORDER BY p.vector <-> $1::vector
        LIMIT $2
      )
      SELECT n.id::text AS id, n."gameId", n."halfMove", n."fenCore", n.distance,
        g."whiteName", g."blackName", g.event, g.result, g."playedAt",
        tags.opening, tags.eco, tags."startFen"
      FROM nearest n
      JOIN "Game" g ON n."gameId" = g.id
      CROSS JOIN LATERAL (
        SELECT substring(g.pgn FROM '\\[Opening "([^"]+)"\\]') AS opening,
          substring(g.pgn FROM '\\[ECO "([A-E][0-9]{2})"\\]') AS eco,
          substring(g.pgn FROM '\\[FEN "([^"]+)"\\]') AS "startFen"
      ) tags
      WHERE ($3::text = '' OR strpos(lower(coalesce(tags.opening, '')), lower($3)) > 0
        OR starts_with(lower(coalesce(tags.eco, '')), lower($3)))
        AND ($4::int IS NULL OR extract(year FROM g."playedAt") >= $4
          AND extract(year FROM g."playedAt") < $4 + 10)
      ORDER BY n.distance, n.id
      LIMIT $5
      `,
      vecLiteral,
      candidateLimit,
      opening,
      era,
      limit,
    ),
  ]);

  // rows[0] is the SET LOCAL result (irrelevant); rows[1] is the query result.
  return rows[1];
}

module.exports = { findExactMatch, findSimilarPositions, fenCoreToFullFen };
