const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { streamGames, prepareGame } = require('./pgn');
const { writeCompactBatch } = require('./compact-ingest');

async function* sourceGames(path) {
  if (!path.endsWith('.zst')) {
    yield* streamGames(path);
    return;
  }
  const decoder = spawn('zstd', ['-dc', '--', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = '';
  decoder.stderr.setEncoding('utf8').on('data', text => {
    diagnostic = (diagnostic + text).slice(-4096);
  });
  const closed = new Promise(resolve => {
    decoder.once('error', resolve);
    decoder.once('close', resolve);
  });
  try {
    yield* streamGames(decoder.stdout);
    const status = await closed;
    if (status instanceof Error) throw status;
    if (status !== 0) throw Error(`zstd failed. A replaced archive needs a fresh checkpoint. ${diagnostic.trim()}`);
  } finally {
    if (decoder.exitCode === null) decoder.kill();
    await closed;
  }
}

function acceptsBroadcast(tags, profile) {
  if (!tags.BroadcastURL?.startsWith('https://lichess.org/broadcast/')) return false;
  if (tags.WhiteTitle !== 'GM' && tags.BlackTitle !== 'GM') return false;
  if (/\bonline\b|lichess\.org|chess\.com/i.test(tags.Site ?? '')) return false;
  const control = tags.TimeControl?.trim() ?? '';
  const explicit = control.match(/^(?:[A-Z]:\s*)?(\d+)\s*(?:minutes?\b|min\b|m\b|'(?!'))/i);
  const clock = control.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  const pgnSeconds = control.match(/^(\d{4,})(?:\s*\+\s*\d+)?$/);
  const minutes = explicit ? Number(explicit[1])
    : clock ? Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3]) / 60
      : pgnSeconds ? Number(pgnSeconds[1]) / 60 : 0;
  return minutes >= profile.classicalMinMinutes;
}

const mib = 2 ** 20;
const budgetError = () => Object.assign(Error('Storage budget reached'), { code: 'CORPUS_BUDGET' });
const budgetSnapshot = tx => tx.$queryRaw`SELECT pg_database_size(current_database())::float8 AS bytes,
  CASE WHEN to_regclass('idx_position_v2_vector_hnsw') IS NULL THEN
    2 * pg_relation_size('position_v2')::float8 + ${16 * mib}::float8 ELSE 0 END AS reserve`;

function budgetGuard(maxDbBytes) {
  return async (tx, games = []) => {
    const [{ bytes, reserve }] = await budgetSnapshot(tx);
    // Leave allocation room for new pages, indexes, staging and a failed
    // transaction's unreclaimed pages. Recheck actual bytes before commit.
    const estimate = games.length ? 2 * mib + games.reduce((sum, game) =>
      sum + 2 * Buffer.byteLength(game.pgn) + 1024 * game.positions.length, 0) : 0;
    if (bytes + reserve + estimate > maxDbBytes) throw budgetError();
  };
}

async function loadCurated(db, path, profile, {
  start = 0, checkpoint = async () => {}, limit, sourceId, maxDbBytes,
  batchSize, dryRun = false, log = console.error,
}) {
  const totals = { scanned: start, games: 0, positions: 0, malformed: 0, projectedBytes: 0, budgetReached: false };
  const began = performance.now();
  let batch = [];
  let ordinal = 0;
  let committed = start;
  const guard = budgetGuard(maxDbBytes);

  async function flush() {
    try {
      if (dryRun) {
        totals.games += batch.length;
        totals.positions += batch.reduce((sum, g) => sum + g.positions.length, 0);
        totals.projectedBytes += batch.length * profile.planningBytesPerGame;
      } else {
        const counts = await writeCompactBatch(db, batch, profile, { sourceId, guard });
        totals.games += counts.games;
        totals.positions += counts.positions;
        await checkpoint(ordinal);
      }
    } catch (error) {
      if (error.code !== 'CORPUS_BUDGET') throw error;
      totals.budgetReached = true;
      return;
    }
    batch = [];
    committed = ordinal;
    const seconds = (performance.now() - began) / 1000;
    const rate = totals.games / Math.max(seconds, 0.001);
    log(`committed=${committed} games=${totals.games} positions=${totals.positions} games/s=${rate.toFixed(1)} stage-eta-s=${rate ? Math.ceil((limit - totals.games) / rate) : 'unknown'}`);
  }

  for await (const raw of sourceGames(path)) {
    if (++ordinal <= start) continue;
    if (acceptsBroadcast(raw.headers, profile)) {
      try {
        const game = prepareGame(raw, { ...profile, minElo: profile.minRating, completedOnly: true, includeMovetext: true });
        if (game) batch.push({ ...game, headers: raw.headers });
      } catch (error) {
        if (++totals.malformed <= 5) log(`Skipping game ${ordinal}: ${error.message.split('\n')[0]}`);
      }
    }
    if (batch.length >= Math.min(batchSize, limit - totals.games) || ordinal - committed >= 1000) await flush();
    if (totals.games >= limit || totals.budgetReached) break;
  }
  if (ordinal > committed && !totals.budgetReached) await flush();
  totals.scanned = committed;
  return totals;
}

async function finishIndex(db, maxDbBytes) {
  const started = performance.now();
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(current_schema() || ':compact-corpus'))`;
    const [{ reserve }] = await budgetSnapshot(tx);
    if (!reserve) return { built: false };
    await budgetGuard(maxDbBytes)(tx);
    const [{ memory }] = await tx.$queryRaw`SELECT current_setting('maintenance_work_mem') AS memory`;
    await tx.$executeRaw`CREATE INDEX idx_position_v2_vector_hnsw
      ON position_v2 USING hnsw (vector halfvec_l2_ops) WHERE vector IS NOT NULL`;
    await budgetGuard(maxDbBytes)(tx);
    return { built: true, maintenanceWorkMem: memory };
  });
  return { ...result, seconds: (performance.now() - started) / 1000 };
}

module.exports = { acceptsBroadcast, loadCurated, finishIndex };
