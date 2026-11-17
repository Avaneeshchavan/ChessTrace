const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Chess } = require('chess.js');
const { prepareGame } = require('../../scripts/lib/pgn');
const { writeCompactBatch } = require('../../scripts/lib/compact-ingest');
const { withCompactScratch } = require('../../scripts/lib/compact-scratch');
const { storageProfile } = require('../../config/storage');
const { positionKey } = require('../compact-position');
const createSearchRouter = require('./searchRoutes');

function fixture(white, elo, date) {
  const headers = {
    White: white, Black: 'Opponent', WhiteElo: elo, BlackElo: elo,
    Date: date, Result: '1-0', Opening: 'Reti Opening', ECO: 'A04',
  };
  return { headers, ...prepareGame({
    headers, body: ['1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. g3 g6 1-0'],
  }) };
}

test('compact search ranks and caps distinct games, verifies replays and preserves HTTP shapes',
  { skip: !process.env.COMPACT_SCRATCH_URL }, async t => {
    const previous = process.env.USE_COMPACT_STORAGE;
    t.after(() => {
      if (previous === undefined) delete process.env.USE_COMPACT_STORAGE;
      else process.env.USE_COMPACT_STORAGE = previous;
    });
    await withCompactScratch(async db => {
      const profile = { ...storageProfile('mvp'), occurrenceCap: 2 };
      const older = fixture('Strong older', 2550, '2020.01.01');
      const newer = fixture('Strong newer', 2550, '2024.01.01');
      const weak = fixture('Weak recent', 2300, '2025.01.01');
      const fen = older.positions[0].fenCore;
      const key = positionKey(fen);

      await writeCompactBatch(db, [older, weak], profile);
      // Exercise gzip replay on a server whose Game column does not use LZ4.
      await db.$executeRaw`ALTER TABLE "Game" ALTER COLUMN pgn SET COMPRESSION pglz`;
      await writeCompactBatch(db, [newer, weak], profile);
      assert.deepEqual(await writeCompactBatch(db, [older, newer], profile), { games: 0, positions: 0 });
      const [row] = await db.$queryRaw`SELECT games_count FROM position_v2 WHERE key = ${key}`;
      assert.equal(row.games_count, 3n, 'repeated positions count only once per game');
      const [storage] = await db.$queryRaw`SELECT g.pgn, cg.pgn_gzip IS NOT NULL AS gzip
        FROM "Game" g JOIN compact_game cg ON g.id=cg.game_id WHERE g."whiteName"='Strong newer'`;
      assert.deepEqual(storage, { pgn: '', gzip: true });

      const legacy = await db.game.create({ data: {
        whiteName: older.whiteName, blackName: older.blackName, result: older.result, pgn: older.pgn,
      } });
      await db.$executeRaw`INSERT INTO "Position" ("gameId","halfMove","fenCore",vector)
        VALUES (${legacy.id},1,${fen},${older.positions[0].vector}::vector)`;

      const app = express();
      app.use(express.json());
      app.use('/api/search', createSearchRouter(db));
      const server = await new Promise((resolve, reject) => {
        const started = app.listen(0, '127.0.0.1', () => resolve(started));
        started.once('error', reject);
      });
      try {
        async function get(path, status = 200) {
          const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search${path}`);
          assert.equal(response.status, status);
          return response.json();
        }
        const query = '?fen=' + encodeURIComponent(new Chess().move('Nf3').after);
        const keys = object => Object.keys(object).sort();

        process.env.USE_COMPACT_STORAGE = 'false';
        const original = await get(query);
        const originalSimilar = await get('/similar' + query);
        assert.equal(original.matches[0].game.id, legacy.id);

        process.env.USE_COMPACT_STORAGE = 'true';
        const compact = await get(query);
        assert.deepEqual(keys(compact), keys(original));
        assert.equal(compact.matchType, 'exact');
        assert.equal(compact.fenCore, fen);
        assert.deepEqual(compact.matches.map(m => m.game.whiteName), ['Strong newer', 'Strong older']);
        for (const match of compact.matches) {
          assert.equal(typeof match.id, 'string');
          assert.equal(match.halfMove, 1);
          assert.deepEqual(keys(match), keys(original.matches[0]));
          assert.deepEqual(keys(match.game), keys(original.matches[0].game));
          assert.deepEqual(await get('/games/' + match.gameId), { pgn: match.game.pgn });
        }
        assert.deepEqual(await get('/games/' + legacy.id), { pgn: older.pgn });
        await get('/games/2147483647', 404);
        const similar = await get('/similar' + query + '&opening=A04&era=2020');
        assert.ok(similar.matches.length);
        assert.deepEqual(keys(similar.matches[0]), keys(originalSimilar.matches[0]));
        assert.equal(similar.matches[0].opening, 'Reti Opening');
        assert.deepEqual(await get('/similar' + query + '&opening=B22'), { matches: [] });

        const wrongCore = older.positions[1].fenCore;
        await db.$executeRaw`UPDATE position_game SET ply=2 WHERE key=${key}`;
        assert.equal((await get(query)).matchType, 'similar', 'a bad game link cannot produce an exact hit');
        await db.$executeRaw`UPDATE position_v2 SET fen_core=${wrongCore} WHERE key=${key}`;
        assert.equal((await get(query)).matchType, 'similar', 'a mismatched hash row is rejected');
        const collision = fixture('Collision attempt', 2600, '2026.01.01');
        await assert.rejects(writeCompactBatch(db, [collision], profile), /key collision/);
        assert.equal(await db.game.count({ where: { whiteName: collision.whiteName } }), 0);
      } finally {
        await new Promise(resolve => {
          server.close(resolve);
          server.closeAllConnections();
        });
      }
    });
  });
