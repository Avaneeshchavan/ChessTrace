#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const { parseArgs } = require('node:util');
const { resolve } = require('node:path');
const { connect, withScratch, loadScratch } = require('./lib/scratch');
const { positiveInt } = require('./lib/options');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { games: { type: 'string', default: '1000' }, 'min-elo': { type: 'string' }, 'completed-only': { type: 'boolean' } },
  });
  if (positionals.length > 1) throw new Error('Usage: node scripts/measure-capacity.js [PGN] [--games 1000]');
  const file = resolve(positionals[0] ?? 'data/test.pgn');
  const limit = positiveInt(values.games, 'games', 1000);
  const db = connect();
  try {
    const result = await withScratch(db, async (schema, s) => {
      const [{ existing }] = await db.$queryRaw`SELECT pg_database_size(current_database()) AS existing`;
      const totals = await loadScratch(db, schema, s, file, {
        limit, minElo: values['min-elo'] ? positiveInt(values['min-elo'], 'min-elo', 4000) : 0,
        completedOnly: values['completed-only'],
      });
      const [sizes] = await db.$queryRawUnsafe(`
        SELECT (SELECT count(*) FROM ${s}."Game")::int AS games,
          (SELECT count(*) FROM ${s}."Position")::int AS positions,
          pg_total_relation_size('${s}."Game"'::regclass)::float8 AS "gameBytes",
          pg_total_relation_size('${s}."Position"'::regclass)::float8 AS "positionBytes",
          pg_relation_size('${s}.idx_position_vector_hnsw'::regclass)::float8 AS "hnswBytes"`);
      const budget = 400_000_000;
      const bytesPerGame = (sizes.positionBytes + sizes.gameBytes) / sizes.games;
      return { file, requestedGames: limit, ...totals, ...sizes, existingDatabaseBytes: Number(existing),
        positionsPerGame: sizes.positions / sizes.games,
        bytesPerPosition: sizes.positionBytes / sizes.positions,
        bytesPerGame, budgetBytes: budget, gamesPer400MB: Math.floor(budget / bytesPerGame),
        additionalGamesWithin400MB: Math.floor(Math.max(0, budget - Number(existing)) / bytesPerGame) };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
