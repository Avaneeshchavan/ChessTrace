const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const { Prisma, PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const live = process.env.CHESSTRACE_LIVE_DB_TEST === '1';
if (live) require('dotenv').config({ quiet: true });

// Offline integration: real HTTP, routes, bcrypt, JWT and SM-2; Prisma only is mocked.
test(`register, save, queue and review a puzzle (${live ? 'live' : 'mock'} Prisma database)`, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'vault-test-secret';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const fields = Prisma.dmmf.datamodel.models.find(m => m.name === 'SavedPuzzle').fields;
  const defaults = Object.fromEntries(fields.filter(f => f.hasDefaultValue).map(f => [f.name, f.default]));
  assert.equal(defaults.easeFactor, 2.5);
  assert.equal(defaults.intervalDays, 0);
  assert.equal(defaults.repetitions, 0);
  assert.equal(defaults.nextReviewAt.name, 'now');
  assert.equal(fields.find(f => f.name === 'lastReviewedAt').isRequired, false);
  let user;
  let puzzle;
  const activity = [];
  const db = live ? new PrismaClient() : {
    user: {
      findUnique: async () => user ?? null,
      create: async ({ data }) => (user = { id: 'test-user', ...data }),
    },
    savedPuzzle: {
      create: async ({ data }) => (puzzle = {
        ...data, id: 'test-puzzle', tags: data.tags.connectOrCreate.map(({ create }) => create), easeFactor: defaults.easeFactor,
        intervalDays: defaults.intervalDays, repetitions: defaults.repetitions,
        nextReviewAt: new Date(), lastReviewedAt: null,
      }),
      findMany: async ({ where, orderBy, take }) => {
        assert.equal(where.userId, user.id);
        assert.ok(where.nextReviewAt.lte instanceof Date);
        assert.deepEqual(orderBy, { nextReviewAt: 'asc' });
        assert.equal(take, 20);
        return puzzle.nextReviewAt <= where.nextReviewAt.lte ? [puzzle] : [];
      },
      findUnique: async ({ where }) => where.id === puzzle.id ? puzzle : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, puzzle.id);
        puzzle = { ...puzzle, ...data, tags: data.tags ? data.tags.connectOrCreate.map(({ create }) => create) : puzzle.tags };
        return puzzle;
      },
    },
    activityLog: {
      create: async ({ data }) => activity.push({ ...data, createdAt: new Date() }),
      findMany: async ({ where }) => activity.filter(log => log.userId === where.userId && log.type === where.type),
    },
    $transaction: async fn => fn(db),
  };
  let testUserId;
  if (live) t.after(async () => {
    try {
      if (testUserId) {
        await db.activityLog.deleteMany({ where: { userId: testUserId } });
        await db.user.delete({ where: { id: testUserId } });
      }
    } finally { await db.$disconnect(); }
  });
  const originalLoad = Module._load;
  const loader = mock.method(Module, '_load', function (name, ...args) {
    return name === '@prisma/client' ? { PrismaClient: class { constructor() { return db; } } }
      : originalLoad.call(this, name, ...args);
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('./authRoutes'));
  app.use('/api/vault', require('./vaultRoutes'));
  loader.mock.restore();
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  async function request(path, method = 'GET', body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json() };
  }
  const registration = await request('/api/auth/register', 'POST', { email: `vault-${randomUUID()}@example.test`, password: 'test-password' });
  assert.equal(registration.status, 201);
  testUserId = registration.body.user.id;
  token = registration.body.token;
  assert.ok(token);
  const saved = await request('/api/vault', 'POST', { tags: ['Fork', 'Pin'], fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.puzzle.repetitions, 0);
  const queue = await request('/api/vault/review-queue');
  assert.equal(queue.status, 200);
  assert.equal(queue.body.queue[0].id, saved.body.puzzle.id);
  const before = Date.now();
  const review = await request(`/api/vault/${saved.body.puzzle.id}/review`, 'POST', { quality: 5 });
  assert.equal(review.status, 200);
  assert.equal(review.body.puzzle.repetitions, 1);
  assert.equal(review.body.puzzle.intervalDays, 1);
  assert.equal(review.body.puzzle.easeFactor, 2.6);
  assert.ok(Date.parse(review.body.puzzle.lastReviewedAt) >= before);
  assert.ok(Date.parse(review.body.puzzle.nextReviewAt) > Date.now());
  const stats = await request('/api/vault/review-stats');
  assert.equal(stats.status, 200);
  assert.deepEqual(stats.body.weeks.map(({ motif, attempts, solved }) => [motif, attempts, solved]).sort(),
    [['Fork', 1, 1], ['Pin', 1, 1]]);
  const edit = await request(`/api/vault/${saved.body.puzzle.id}/tags`, 'PATCH', { tags: ['Skewer', 'Pin'] });
  assert.equal(edit.status, 200);
  assert.deepEqual(edit.body.puzzle.tags.map(tag => tag.name).sort(), ['Pin', 'Skewer']);
  assert.deepEqual((await request('/api/vault/review-stats')).body, stats.body);
  assert.deepEqual((await request('/api/vault/review-queue')).body.queue, []);
});
