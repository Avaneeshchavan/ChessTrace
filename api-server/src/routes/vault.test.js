const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const { Prisma, PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const live = process.env.CHESSTRACE_LIVE_DB_TEST === '1';
if (live) require('dotenv').config({ quiet: true });

// Offline integration: real HTTP, routes, bcrypt, JWT and SM-2; Prisma only is mocked.
test(`register, save, queue and review a puzzle (${live ? 'live' : 'mock'} Prisma database)`, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const previousTolerance = process.env.PUZZLE_TOLERANCE_CP;
  process.env.JWT_SECRET = 'vault-test-secret';
  process.env.PUZZLE_TOLERANCE_CP = '25';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousTolerance === undefined) delete process.env.PUZZLE_TOLERANCE_CP;
    else process.env.PUZZLE_TOLERANCE_CP = previousTolerance;
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
  const attempts = new Map();
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
      findUnique: async ({ where }) =>
        where.id === puzzle.id && (!where.userId || where.userId === puzzle.userId) ? puzzle : null,
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
    attempt: {
      create: async ({ data }) => {
        if (attempts.has(data.id)) throw Object.assign(new Error('Duplicate attempt'), { code: 'P2002' });
        const record = { ...data, createdAt: new Date() };
        attempts.set(data.id, record);
        return record;
      },
      findUnique: async ({ where }) => attempts.get(where.id),
      findMany: async ({ where }) => [...attempts.values()].filter(row => row.userId === where.userId && row.createdAt >= where.createdAt.gte),
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
  async function request(path, method = 'GET', body, bearer = token) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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

  const { DEFAULT_POSITION } = require('chess.js');
  const playable = await request('/api/vault', 'POST', { fen: DEFAULT_POSITION, solutionPgn: '1. e4', tags: ['Fork'] });
  assert.equal(playable.status, 201);
  const target = playable.body.puzzle.id;
  const queueAfterSave = await request('/api/vault/review-queue');
  assert.equal(queueAfterSave.body.queue[0].solution.moves[0].lan, 'e2e4');
  assert.equal(queueAfterSave.body.toleranceCp, 25);
  const path = `/api/vault/${target}/attempts`;
  const alternative = { attemptId: randomUUID(), moveUci: 'd2d4', usedHint: true, evalLoss: 25, millis: 700 };
  assert.equal((await request(path, 'POST', alternative, null)).status, 401);
  const other = jwt.sign({ id: 'different-user' }, process.env.JWT_SECRET);
  assert.equal((await request(path, 'POST', alternative, other)).status, 404);
  assert.equal((await request(path, 'POST', { ...alternative, moveUci: 'd2d5' })).status, 400);
  assert.equal((await request(path, 'POST', { ...alternative, evalLoss: -1 })).status, 400);
  const submitted = await request(path, 'POST', alternative);
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.attempt.correct, true);
  const replay = await request(path, 'POST', alternative);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, submitted.body);
  assert.equal((await request(path, 'POST', { ...alternative, moveUci: 'c2c4' })).status, 409);
  const wrong = await request(path, 'POST', { ...alternative, attemptId: randomUUID(), moveUci: 'a2a3', evalLoss: 26 });
  assert.equal(wrong.body.attempt.correct, false);
  const exact = await request(path, 'POST', { ...alternative, attemptId: randomUUID(), moveUci: 'e2e4', evalLoss: null });
  assert.equal(exact.body.attempt.correct, true);
  assert.equal(exact.body.attempt.evalLoss, 0);
  await request(`/api/vault/${target}/tags`, 'PATCH', { tags: ['Pin'] });
  const afterAttempts = await request('/api/vault/review-stats');
  assert.deepEqual(afterAttempts.body.weeks, stats.body.weeks);
  assert.deepEqual(afterAttempts.body.attemptWeeks.map(({ motif, solved, attempts }) => [motif, solved, attempts]),
    [['Fork', 2, 3]]);
  const schedule = await request('/api/vault/review-queue');
  assert.equal(schedule.body.queue[0].repetitions, 0);

  const mate = await request('/api/vault', 'POST', {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', solutionPgn: '2... Qh4#', tags: [],
  });
  const matePath = `/api/vault/${mate.body.puzzle.id}/attempts`;
  const nonMate = await request(matePath, 'POST', { ...alternative, attemptId: randomUUID(), moveUci: 'b8c6' });
  assert.equal(nonMate.body.attempt.correct, false);
  assert.equal(nonMate.body.attempt.evalLoss, null);
  const matingMove = await request(matePath, 'POST', { ...alternative, attemptId: randomUUID(), moveUci: 'd8h4', evalLoss: null });
  assert.equal(matingMove.body.attempt.correct, true);
});
