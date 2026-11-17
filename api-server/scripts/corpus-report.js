require('dotenv').config({ quiet: true });
const { copyDatabase } = require('./lib/copy-db');

async function main() {
  if (!process.env.DIRECT_URL) throw Error('Configure DIRECT_URL for the database to report.');
  const db = copyDatabase(process.env.DIRECT_URL);
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const [state] = await tx.$queryRaw`SELECT to_regclass('compact_game') IS NOT NULL AS compact_available,
        pg_database_size(current_database())::float8 AS database_bytes`;
      if (!state.compact_available) {
        const [legacy] = await tx.$queryRaw`SELECT count(*)::float8 AS legacy_games FROM "Game"`;
        return { ...state, ...legacy };
      }
      const [summary] = await tx.$queryRaw`SELECT (SELECT count(*)::float8 FROM compact_game) AS games,
        count(*)::float8 AS distinct_positions, count(vector)::float8 AS vector_positions,
        coalesce(sum(games_count),0)::float8 AS distinct_game_position_pairs,
        (SELECT count(*)::float8 FROM position_game) AS retained_links,
        pg_database_size(current_database())::float8 AS database_bytes,
        coalesce(pg_relation_size(to_regclass('idx_position_v2_vector_hnsw')),0)::float8 AS hnsw_bytes
        FROM position_v2`;
      const ratings = await tx.$queryRaw`SELECT (("whiteElo" + "blackElo") / 200) * 100 AS average_elo_band,
        count(*)::int AS games FROM compact_game cg JOIN "Game" g ON cg.game_id=g.id GROUP BY 1 ORDER BY 1`;
      const years = await tx.$queryRaw`SELECT extract(year FROM "playedAt")::int AS year,
        count(*)::int AS games FROM compact_game cg JOIN "Game" g ON cg.game_id=g.id GROUP BY 1 ORDER BY 1`;
      const openings = await tx.$queryRaw`SELECT eco, count(*)::int AS games
        FROM compact_game GROUP BY eco ORDER BY games DESC, eco`;
      const sources = await tx.$queryRaw`SELECT source_id,count(*)::int AS games
        FROM compact_game GROUP BY source_id ORDER BY source_id`;
      const ratio = summary.distinct_positions ? summary.distinct_game_position_pairs / summary.distinct_positions : null;
      return { ...summary, dedupe_ratio_pairs_per_core: ratio, ratings, years, openings, sources };
    });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
