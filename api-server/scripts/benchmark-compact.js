const { parseArgs } = require('node:util');
const { basename, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');
const { storageProfile } = require('../config/storage');
const { ingestCompactFile } = require('./lib/compact-ingest');
const { withCompactScratch } = require('./lib/compact-scratch');
const { positiveInt } = require('./lib/options');
const { findCompactExact, findCompactSimilar } = require('../src/compact-search');
const { fenCoreToFullFen } = require('../src/search');

async function recall(db, samples, subset) {
  await db.$executeRaw`CREATE TABLE recall_subset AS
    SELECT key, vector FROM position_v2 WHERE vector IS NOT NULL
    ORDER BY md5(key::text || ':subset') LIMIT ${subset}`;
  await db.$executeRaw`CREATE INDEX recall_subset_hnsw ON recall_subset USING hnsw (vector halfvec_l2_ops)`;
  await db.$executeRaw`ANALYZE recall_subset`;
  const [{ count }] = await db.$queryRaw`SELECT count(*)::int AS count FROM recall_subset`;
  const k = Math.min(count, 10);
  let ids = 0;
  let ties = 0;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('enable_seqscan', 'off', true), set_config('hnsw.ef_search', '40', true)`;
    const [{ 'QUERY PLAN': plan }] = await tx.$queryRaw`EXPLAIN (FORMAT JSON)
      SELECT key FROM recall_subset ORDER BY vector <-> ${samples[0].vector}::halfvec LIMIT ${k}`;
    if (!JSON.stringify(plan).includes('recall_subset_hnsw')) throw new Error('Recall did not use HNSW');
    for (const sample of samples) {
      const approximate = await tx.$queryRaw`SELECT key, vector <-> ${sample.vector}::halfvec AS distance
        FROM recall_subset ORDER BY vector <-> ${sample.vector}::halfvec LIMIT ${k}`;
      const truth = await tx.$queryRaw`SELECT key, vector <-> ${sample.vector}::halfvec AS distance
        FROM recall_subset ORDER BY (vector <-> ${sample.vector}::halfvec) + 0, key LIMIT ${k}`;
      const expected = new Set(truth.map(row => row.key));
      ids += approximate.filter(row => expected.has(row.key)).length;
      ties += approximate.filter(row => row.distance <= truth.at(-1).distance).length;
    }
  }, { timeout: 120_000 });
  return { count, k, byId: ids / (samples.length * k), tiesAccepted: ties / (samples.length * k) };
}

async function run(db, file, profile, limit, queries) {
  await db.$executeRaw`DROP INDEX idx_position_v2_vector_hnsw`;
  const ingest = await ingestCompactFile(db, file, profile, { limit });
  if (!ingest.positions) throw new Error('No eligible games in the sample.');
  const buildStart = performance.now();
  await db.$executeRaw`CREATE INDEX idx_position_v2_vector_hnsw
    ON position_v2 USING hnsw (vector halfvec_l2_ops) WHERE vector IS NOT NULL`;
  const indexSeconds = (performance.now() - buildStart) / 1000;
  await db.$executeRaw`VACUUM ANALYZE position_v2`;
  await db.$executeRaw`VACUUM ANALYZE position_game`;
  await db.$executeRaw`ANALYZE "Game"`;
  await db.$executeRaw`ANALYZE compact_game`;
  const sizes = await db.$queryRaw`SELECT relname AS name,
    pg_table_size(oid)::float8 AS heap, pg_indexes_size(oid)::float8 AS indexes
    FROM pg_class WHERE relnamespace = current_schema()::regnamespace
      AND relname IN ('Game','compact_game','position_v2','position_game') ORDER BY relname`;
  const [counts] = await db.$queryRaw`SELECT count(*)::int AS distinct,
    count(vector)::int AS vectors, (SELECT count(*)::int FROM position_game) AS links,
    pg_relation_size('idx_position_v2_vector_hnsw')::float8 AS hnsw FROM position_v2`;
  const samples = await db.$queryRaw`SELECT fen_core AS fen, vector::text AS vector
    FROM position_v2 WHERE vector IS NOT NULL ORDER BY md5(key::text || ':query') LIMIT ${queries}`;
  if (!samples.length) throw new Error('No vector samples found.');
  const [{ 'QUERY PLAN': annPlan }] = await db.$queryRaw`EXPLAIN (FORMAT JSON)
    SELECT key FROM position_v2 WHERE vector IS NOT NULL ORDER BY vector <-> ${samples[0].vector}::halfvec LIMIT 10`;
  const exact = [];
  const ann = [];
  for (const { fen } of samples) {
    let started = performance.now();
    const exactMatches = await findCompactExact(db, fen);
    exact.push(performance.now() - started);
    started = performance.now();
    const similarMatches = await findCompactSimilar(db, fenCoreToFullFen(fen), 10);
    ann.push(performance.now() - started);
    if (!exactMatches.length || !similarMatches.length) throw new Error('Sample did not return verified matches');
  }
  const bytes = sizes.reduce((sum, table) => sum + table.heap + table.indexes, 0);
  const stats = values => {
    values.sort((a, b) => a - b);
    return [values[Math.ceil(values.length * 0.50) - 1], values[Math.ceil(values.length * 0.95) - 1]];
  };
  const [server] = await db.$queryRaw`SELECT version() AS postgres,
    (SELECT extversion FROM pg_extension WHERE extname='vector') AS pgvector,
    (SELECT to_jsonb(a)->>'attcompression' FROM pg_attribute a WHERE attrelid='"Game"'::regclass AND attname='pgn') AS compression`;
  return {
    file: basename(file), profile, limit, server, ingest, counts, sizes, bytes, indexSeconds,
    bytesPerPosition: bytes / counts.distinct, bytesPerGame: bytes / ingest.games,
    projectedGames: Math.floor(profile.maxDbBytes / (bytes / ingest.games)),
    queries: samples.length, exactMs: stats(exact), annMs: stats(ann),
    annUsesIndex: JSON.stringify(annPlan).includes('idx_position_v2_vector_hnsw'),
    recall: await recall(db, samples, profile.benchmarkRecallSubset),
  };
}

async function main() {
  const { values, positionals: [path, ...extra] } = parseArgs({
    allowPositionals: true,
    options: {
      profile: { type: 'string', default: 'mvp' }, games: { type: 'string', default: '1000' },
      plies: { type: 'string' }, queries: { type: 'string', default: '100' },
    },
  });
  if (!path || extra.length) throw new Error('Usage: node scripts/benchmark-compact.js FILE [--games 1000] [--plies 40,50,60]');
  const base = storageProfile(values.profile);
  const limits = values.plies ? values.plies.split(',').map(n => positiveInt(n, 'plies', base.maxPly)) : [base.maxPly];
  const limit = positiveInt(values.games, 'games', 1000000);
  const queries = positiveInt(values.queries, 'queries', 1000);
  const results = [];
  for (const maxPly of limits) {
    const profile = { ...base, maxPly, vectorMaxPly: Math.min(base.vectorMaxPly, maxPly) };
    const result = await withCompactScratch(db => run(db, resolve(path), profile, limit, queries));
    results.push(result);
    console.error(`Measured ${result.ingest.games}/${limit} games at ${maxPly} plies`);
  }
  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
