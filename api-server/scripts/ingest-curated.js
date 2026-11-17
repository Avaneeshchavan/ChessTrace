require('dotenv').config({ quiet: true });
const { parseArgs } = require('node:util');
const { realpath, stat } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { openCheckpoint } = require('./ingest');
const { copyDatabase } = require('./lib/copy-db');
const { loadCurated, finishIndex } = require('./lib/curated');
const { positiveInt } = require('./lib/options');
const { storageProfile } = require('../config/storage');
const sources = require('../../data/sources.json');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: 'string', default: 'lichess-broadcast' },
      'max-games': { type: 'string', default: '500' }, 'batch-size': { type: 'string', default: '25' },
      'max-db-bytes': { type: 'string' }, checkpoint: { type: 'string' },
      'dry-run': { type: 'boolean' }, 'defer-index': { type: 'boolean' }, 'finish-index': { type: 'boolean' },
    },
  });
  const profile = storageProfile();
  const maxDbBytes = values['max-db-bytes']
    ? positiveInt(values['max-db-bytes'], 'max-db-bytes', profile.maxDbBytes) : profile.maxDbBytes;
  const url = process.env.DIRECT_URL;
  if (!values['dry-run'] && !url) throw Error('Configure DIRECT_URL with the non-pooled PostgreSQL connection.');
  if (values['finish-index']) {
    if (positionals.length || values['dry-run'] || values['defer-index']) throw Error('Run --finish-index separately.');
    const db = copyDatabase(url);
    try { console.log(JSON.stringify(await finishIndex(db, maxDbBytes))); }
    finally { await db.close(); }
    return;
  }
  if (positionals.length !== 1) throw Error('Usage: node scripts/ingest-curated.js FILE.pgn.zst [--max-games N] [--dry-run]');
  const source = sources.find(item => item.id === values.source && item.status === 'approved');
  if (!source) throw Error('Source is not approved for this importer.');
  const file = await realpath(positionals[0]);
  const info = await stat(file);
  if (!info.isFile() || !/\.pgn(?:\.zst)?$/.test(file)) throw Error('Input must be a PGN or a .pgn.zst archive.');
  if (values['dry-run'] && profile.planningBytesPerGame == null) throw Error('Dry-run size for this profile is not measured.');
  const options = {
    limit: positiveInt(values['max-games'], 'max-games', 1_000_000), maxDbBytes,
    batchSize: positiveInt(values['batch-size'], 'batch-size', 100),
    sourceId: source.id, dryRun: values['dry-run'],
  };
  if (values['dry-run']) {
    console.log(JSON.stringify(await loadCurated(null, file, profile, options)));
    return;
  }
  const target = new URL(url);
  const identity = createHash('sha256').update(JSON.stringify([
    1, file, info.size, info.mtimeMs, target.hostname, target.port, target.pathname,
    target.searchParams.get('schema') || 'public', profile, source.id,
  ])).digest('hex');
  const path = resolve(values.checkpoint ?? `.ingest-checkpoints/m3-${identity}.json`);
  const resume = await openCheckpoint(path, identity);
  const db = copyDatabase(url);
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(current_schema() || ':compact-corpus'))`;
      const [state] = await tx.$queryRaw`SELECT EXISTS (SELECT 1 FROM compact_game) AS populated,
        EXISTS (SELECT 1 FROM compact_game WHERE movetext_hash IS NULL) AS legacy`;
      if (state.legacy) throw Error('Existing compact rows lack normalized identities. Use a fresh compact corpus.');
      if (values['defer-index'] && !state.populated) await tx.$executeRaw`DROP INDEX IF EXISTS idx_position_v2_vector_hnsw`;
    });
    console.error(`Resuming after source game ${resume.start}; checkpoint: ${path}`);
    const result = await loadCurated(db, file, profile, { ...options, ...resume });
    console.log(JSON.stringify(result));
  } finally { await db.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
