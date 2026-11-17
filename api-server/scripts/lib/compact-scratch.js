const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

function scratchUrl(value = process.env.COMPACT_SCRATCH_URL) {
  if (!value) throw new Error('Set COMPACT_SCRATCH_URL to an empty local PostgreSQL database.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || !/^\/chesstrace_m2_[a-z0-9_]+$/.test(url.pathname)
      || url.search || url.hash) {
    throw new Error('Scratch URL must use a loopback IP and a dedicated chesstrace_m2_* database, without URL options.');
  }
  return url;
}

async function withCompactScratch(run) {
  const url = scratchUrl();
  const admin = new PrismaClient({ datasourceUrl: url.href });
  const schema = 'ct_m2_' + randomBytes(8).toString('hex');
  try {
    const [row] = await admin.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector`;
    if (row.vector) throw new Error('Use a fresh scratch database with no installed vector extension.');
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'), env: { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const db = new PrismaClient({ datasourceUrl: url.href });
    try { return await run(db); }
    finally { await db.$disconnect(); }
  } finally {
    try { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.$disconnect(); }
  }
}

module.exports = { withCompactScratch, scratchUrl };
