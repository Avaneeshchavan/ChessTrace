const { performance } = require('node:perf_hooks');
const { Client } = require('pg');
const { Prisma } = require('@prisma/client');
const { storageProfile } = require('../config/storage');
const { DEFAULT_THRESHOLD, parseTwinGame, positionInput, queryTwinGame } = require('../src/twin-game');

require('dotenv').config({ quiet: true });

const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4';
const samples = 5;

async function benchmark() {
  const endpoint = new URL(process.env.DIRECT_URL);
  if (!endpoint.hostname.endsWith('.neon.tech') || !['require', 'verify-full'].includes(endpoint.searchParams.get('sslmode'))) {
    throw new Error('Configure an SSL-protected Neon DIRECT_URL.');
  }
  endpoint.searchParams.set('sslmode', 'verify-full');
  const client = new Client({ connectionString: endpoint.href, connectionTimeoutMillis: 8_000, statement_timeout: 7_000 });
  try {
    const connectStarted = performance.now();
    await client.connect();
    const connectMs = performance.now() - connectStarted;
    await client.query('BEGIN READ ONLY');
    const prisma = { async $queryRaw(parts, ...values) {
      const query = Prisma.sql(parts, ...values);
      return (await client.query(query.text, query.values)).rows;
    } };
    const history = parseTwinGame(pgn);
    const input = positionInput(history);
    const { rows: [state] } = await client.query(
      `SELECT to_regclass('public.position_v2') IS NOT NULL AS compact,
        EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '0005_puzzle_attempts'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS "m6MigrationApplied"`);
    const timings = [];
    for (const compact of [false, true]) {
      if (compact && !state.compact) continue;
      const measured = [];
      let row;
      for (let i = 0; i < samples; i++) {
        const start = performance.now();
        [row] = await queryTwinGame(prisma, input, DEFAULT_THRESHOLD, storageProfile(), compact);
        measured.push(Number((performance.now() - start).toFixed(1)));
      }
      timings.push({
        layout: compact ? 'compact' : 'legacy', corpusGames: row.corpusGames, departure: row.departure,
        wallMs: measured, medianMs: [...measured].sort((a, b) => a - b)[Math.floor(samples / 2)],
      });
    }
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ scope: 'read-only Neon, SQL round trip including row transfer, excluding HTTP and replay decoding',
      pgn, plies: history.length, samplesPerLayout: samples, connectMs: Number(connectMs.toFixed(1)),
      m6MigrationApplied: state.m6MigrationApplied, timings }, null, 2));
  } finally {
    await client.end();
  }
}

benchmark().catch(error => {
  console.error('Twin Game benchmark failed:', error.code || error.name);
  process.exitCode = 1;
});
