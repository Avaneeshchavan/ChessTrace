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
  const efSearch = options.efSearch ?? 40;
  const fullFen = fenCoreToFullFen(fenCore);
  const vec = computeStructuralVector(fullFen);
  const vecLiteral = toPgvectorLiteral(vec);

  // hnsw.ef_search is a per-session GUC; setting it inside the same
  // transaction/connection as the query that follows.
  const rows = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${Number(efSearch)}`),
    prisma.$queryRawUnsafe(
      `
      SELECT
        p.id::text AS id,
        p."gameId" AS "gameId",
        p."halfMove" AS "halfMove",
        p."fenCore" AS "fenCore",
        p.vector <-> $1::vector AS distance,
        g."whiteName",
        g."blackName",
        g."event",
        g."result",
        g."playedAt"
      FROM "Position" p
      JOIN "Game" g ON p."gameId" = g.id
      WHERE p.vector IS NOT NULL
      ORDER BY p.vector <-> $1::vector
      LIMIT $2
      `,
      vecLiteral,
      limit
    ),
  ]);

  // rows[0] is the SET LOCAL result (irrelevant); rows[1] is the query result.
  return rows[1];
}

module.exports = { findExactMatch, findSimilarPositions, fenCoreToFullFen };
