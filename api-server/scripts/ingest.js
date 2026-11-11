#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const { createHash, randomBytes } = require('node:crypto');
const { resolve, dirname } = require('node:path');
const { parseArgs } = require('node:util');
const { PrismaClient } = require('@prisma/client');
const { ingestFile, identifier } = require('./lib/ingest-data');
const { positiveInt } = require('./lib/options');

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function openCheckpoint(path, identity) {
  let start = 0;
  try {
    const state = JSON.parse(await fs.readFile(path, 'utf8'));
    if (state.identity !== identity || !Number.isSafeInteger(state.scanned) || state.scanned < 0) {
      throw new Error('Checkpoint does not match the input, destination, or filters. Use a new checkpoint path.');
    }
    start = state.scanned;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(dirname(path), { recursive: true });
  return {
    start,
    async checkpoint(scanned) {
      const tmp = path + '.' + randomBytes(8).toString('hex') + '.tmp';
      try {
        await fs.writeFile(tmp, JSON.stringify({ identity, scanned }) + '\n', { flag: 'wx' });
        await fs.rename(tmp, path);
      } finally { await fs.rm(tmp, { force: true }); }
    },
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'batch-size': { type: 'string', default: '25' }, 'position-chunk': { type: 'string', default: '4000' },
      'max-games': { type: 'string' }, 'min-elo': { type: 'string' }, 'completed-only': { type: 'boolean' },
      checkpoint: { type: 'string' }, schema: { type: 'string' },
    },
  });
  if (positionals.length !== 1) throw new Error('Usage: node scripts/ingest.js <PGN> [--batch-size 25] [--position-chunk 4000] [--checkpoint FILE]');
  const file = await fs.realpath(positionals[0]);
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Input must be an uncompressed PGN file');
  const datasourceUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!datasourceUrl) throw new Error('Configure DATABASE_URL in api-server/.env');
  const target = new URL(datasourceUrl);
  const schema = values.schema ?? target.searchParams.get('schema') ?? 'public';
  identifier(schema);
  const minElo = values['min-elo'] ? positiveInt(values['min-elo'], 'min-elo', 4000) : 0;
  const completedOnly = values['completed-only'] ?? false;
  const identity = digest([1, file, stat.size, stat.mtimeMs, target.hostname, target.port, target.pathname, schema, minElo, completedOnly]);
  const checkpointPath = resolve(values.checkpoint ?? `.ingest-checkpoints/${identity}.json`);
  const resume = await openCheckpoint(checkpointPath, identity);
  const db = new PrismaClient({ datasourceUrl });
  try {
    console.log(`Ingesting ${file} into ${schema}; resuming after game #${resume.start}; checkpoint: ${checkpointPath}`);
    const totals = await ingestFile(db, file, {
      ...resume, schema, minElo, completedOnly,
      batchSize: positiveInt(values['batch-size'], 'batch-size', 100),
      positionChunk: positiveInt(values['position-chunk'], 'position-chunk', 8000),
      limit: values['max-games'] ? positiveInt(values['max-games'], 'max-games', 1_000_000) : Infinity,
    });
    console.log(JSON.stringify(totals));
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { openCheckpoint };
