#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const { parseArgs } = require('node:util');
const { resolve, basename } = require('node:path');
const { writeFile } = require('node:fs/promises');
const { connect, withScratch, loadScratch } = require('./lib/scratch');
const { positiveInt } = require('./lib/options');

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

async function benchmark(db, s, queryCount, subsetSize) {
  const subset = `${s}."RecallPosition"`;
  const position = `${s}."Position"`;
  const game = `${s}."Game"`;
  await db.$executeRawUnsafe(`CREATE TABLE ${subset} AS
    SELECT id,vector FROM ${position} WHERE vector IS NOT NULL ORDER BY md5(id::text || ':subset') LIMIT $1`, subsetSize);
  await db.$executeRawUnsafe(`CREATE INDEX recall_hnsw ON ${subset} USING hnsw (vector vector_l2_ops)
    WITH (m=16, ef_construction=64)`);
  await db.$executeRawUnsafe(`ANALYZE ${subset}`);
  const [{ count, k }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count, least(10, count(*))::int AS k FROM ${subset}`);
  const exact = `SELECT p.id,p."gameId",p."halfMove",p."fenCore",g.* FROM ${position} p
    JOIN ${game} g ON g.id=p."gameId" WHERE p."fenCore"=$1 LIMIT 100`;
  const ann = `WITH neighbors AS MATERIALIZED (
    SELECT p.id,p."gameId",p."halfMove",p."fenCore",p.vector <-> $1 AS distance
    FROM ${position} p WHERE p.vector IS NOT NULL ORDER BY p.vector <-> $1 LIMIT 10
  ) SELECT n.*,g."whiteName",g."blackName",g.event,g.result,g."playedAt"
    FROM neighbors n JOIN ${game} g ON g.id=n."gameId" ORDER BY n.distance`;
  const subsetAnn = `SELECT id,vector <-> $1 AS distance FROM ${subset} ORDER BY vector <-> $1 LIMIT $2`;

  // Server-side execution times keep Neon network RTT and Node vector computation
  // out of the numbers. EXPLAIN ANALYZE executes the actual lookup queries.
  await db.$executeRawUnsafe(`CREATE FUNCTION ${s}.measure(q_count integer, k integer)
    RETURNS TABLE(exact_ms float8, ann_ms float8, id_recall float8, tie_recall float8)
    LANGUAGE plpgsql SET jit = off SET enable_seqscan = off SET hnsw.ef_search = 40 AS $fn$
    DECLARE q record; plan json; truth bigint[]; threshold float8; candidate record; hits int; ties int;
    BEGIN
      FOR q IN SELECT p."fenCore" AS fen,p.vector AS v FROM ${position} p
        WHERE p.vector IS NOT NULL ORDER BY md5(p.id::text || ':query') LIMIT q_count
      LOOP
        EXECUTE $q$EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) ${exact}$q$ INTO plan USING q.fen;
        IF position('idx_position_fencore_hash' IN plan::text) = 0 THEN RAISE EXCEPTION 'Exact hash index not used'; END IF;
        exact_ms := (plan->0->>'Execution Time')::float8;
        EXECUTE $q$EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) ${ann}$q$ INTO plan USING q.v;
        IF position('idx_position_vector_hnsw' IN plan::text) = 0 THEN RAISE EXCEPTION 'Full HNSW index not used'; END IF;
        ann_ms := (plan->0->>'Execution Time')::float8;
        EXECUTE $q$EXPLAIN (FORMAT JSON) ${subsetAnn}$q$ INTO plan USING q.v,k;
        IF position('recall_hnsw' IN plan::text) = 0 THEN RAISE EXCEPTION 'Recall HNSW index not used'; END IF;

        PERFORM set_config('enable_seqscan', 'on', true);
        -- Adding zero disqualifies the HNSW ordering path. Every candidate is scored.
        SELECT array_agg(t.id),max(t.d) INTO truth,threshold FROM
          (SELECT id,vector <-> q.v AS d FROM ${subset} ORDER BY (vector <-> q.v) + 0,id LIMIT k) t;
        PERFORM set_config('enable_seqscan', 'off', true);
        hits := 0; ties := 0;
        FOR candidate IN EXECUTE $q$${subsetAnn}$q$ USING q.v,k LOOP
          IF candidate.id = ANY(truth) THEN hits := hits + 1; END IF;
          IF candidate.distance <= threshold THEN ties := ties + 1; END IF;
        END LOOP;
        id_recall := hits::float8 / k;
        tie_recall := ties::float8 / k;
        RETURN NEXT;
      END LOOP;
    END $fn$`);
  const rows = await db.$queryRawUnsafe(`SELECT * FROM ${s}.measure($1::int,$2::int)`, queryCount, k);
  if (!rows.length) throw new Error('No query samples available');
  const [{ version }] = await db.$queryRaw`SELECT extversion AS version FROM pg_extension WHERE extname='vector'`;
  const exactTimes = rows.map(r => r.exact_ms), annTimes = rows.map(r => r.ann_ms);
  const mean = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  return {
    samples: rows.length, subset: count, k, version, idRecall: mean('id_recall'), tieRecall: mean('tie_recall'),
    exact: [percentile(exactTimes, .50), percentile(exactTimes, .95)],
    ann: [percentile(annTimes, .50), percentile(annTimes, .95)],
  };
}

function report(file, totals, r) {
  const ms = values => values.map(value => value.toFixed(3)).join(' | ');
  const pct = value => (100 * value).toFixed(2) + '%';
  return `# ChessTrace query benchmarks

Measured on ${new Date().toISOString().slice(0, 10)} using \`${basename(file)}\` on PostgreSQL with pgvector ${r.version}.
The temporary database schema held **${totals.games.toLocaleString('en-US')} games and ${totals.positions.toLocaleString('en-US')} positions**.
Queries use ${r.samples.toLocaleString('en-US')} deterministic samples from stored positions. Recall uses a separately sampled ${r.subset.toLocaleString('en-US')}-position subset.

| Query | Samples | p50 (ms) | p95 (ms) |
| --- | ---: | ---: | ---: |
| Exact fenCore lookup (up to 100 results) | ${r.samples} | ${ms(r.exact)} |
| ANN L2 lookup (up to 10 results) | ${r.samples} | ${ms(r.ann)} |

| Recall against brute force | Subset positions | Result |
| --- | ---: | ---: |
| Recall@${r.k}, same position IDs | ${r.subset} | ${pct(r.idRecall)} |
| Recall@${r.k}, accepting ties at the exact cutoff | ${r.subset} | ${pct(r.tieRecall)} |

PostgreSQL execution time from \`EXPLAIN ANALYZE\`, excluding planning, network, API and vector computation. The run follows a fresh import, index build and ANALYZE; the ANN query selects the top 10 neighbors before joining game metadata. This is not a cold-start test. Sequential scans were discouraged for the timed lookups and the plans were checked for the hash and HNSW indexes. HNSW uses \`m=16\`, \`ef_construction=64\` and \`ef_search=40\`.
Brute force scores every subset vector and breaks distance ties by ID. The second recall row counts any returned neighbor at or below the true kth distance; equal signatures can have distinct position IDs. A sampled query can itself be in the candidate set. Results describe this dataset and workload, not production API latency or quality on unseen positions.
`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: {
      games: { type: 'string', default: '1000' }, queries: { type: 'string', default: '1000' },
      subset: { type: 'string', default: '5000' }, output: { type: 'string' },
    },
  });
  if (positionals.length > 1) throw new Error('Usage: node scripts/benchmark.js [PGN] [--games 1000] [--output FILE]');
  const file = resolve(positionals[0] ?? 'data/test.pgn');
  const limit = positiveInt(values.games, 'games', 1000);
  const queries = positiveInt(values.queries, 'queries', 1000);
  const subset = positiveInt(values.subset, 'subset', 5000);
  const output = resolve(values.output ?? resolve(__dirname, '../../docs/BENCHMARKS.md'));
  const db = connect();
  try {
    const markdown = await withScratch(db, async (schema, s) => {
      const totals = await loadScratch(db, schema, s, file, { limit });
      return report(file, totals, await benchmark(db, s, queries, subset));
    });
    await writeFile(output, markdown);
    console.log(markdown);
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { benchmark, percentile, report };
