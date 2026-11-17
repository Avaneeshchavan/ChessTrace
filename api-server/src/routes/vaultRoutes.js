const express = require('express');
const prisma = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  attemptTolerance, legalAttempt, savedSolution, weeklyRates, MAX_ATTEMPT_MILLIS, MAX_EVAL_LOSS,
} = require('../lib/puzzleAttempts');

const router = express.Router();

router.use(authMiddleware);

function cleanTags(tags) {
  if (!Array.isArray(tags) || tags.length > 12
    || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)) return null;
  return [...new Set(tags.map(tag => tag.trim()))];
}

const tagConnections = tags => tags.map(name => ({ where: { name }, create: { name } }));

// GET /api/vault?motif=Pin&status=DUE_TODAY
router.get('/', async (req, res) => {
  try {
    const { motif, status } = req.query;
    
    const where = { userId: req.user.id };
    if (status) {
      where.reviewStatus = status;
    }
    if (motif) {
      where.tags = {
        some: { name: motif },
      };
    }

    const puzzles = await prisma.savedPuzzle.findMany({
      where,
      include: { tags: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ puzzles });
  } catch (err) {
    console.error('Vault GET error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vault
router.post('/', async (req, res) => {
  try {
    const { fen, initialMove, solutionPgn, mateIn, tags = [] } = req.body;
    
    if (!fen) {
      return res.status(400).json({ error: 'fen is required' });
    }

    const names = cleanTags(tags);
    if (!names) return res.status(400).json({ error: 'Select up to 12 valid motifs.' });
    if (mateIn != null && (!Number.isInteger(mateIn) || mateIn < 1 || mateIn > 100)) {
      return res.status(400).json({ error: 'mateIn must be a whole number between 1 and 100.' });
    }

    const puzzle = await prisma.savedPuzzle.create({
      data: {
        userId: req.user.id,
        fen,
        initialMove,
        solutionPgn,
        mateIn,
        tags: {
          connectOrCreate: tagConnections(names),
        },
      },
      include: { tags: true },
    });

    res.status(201).json({ puzzle });

    // Fire-and-forget logging
    prisma.activityLog.create({
      data: {
        userId: req.user.id,
        type: 'PUZZLE_SAVED',
        refId: puzzle.id,
        metadata: names.length > 0 ? { theme: names[0] } : {},
      }
    }).catch(err => console.error("Failed to log activity:", err));
  } catch (err) {
    console.error('Vault POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const { calculateNextReview } = require('../lib/sm2');

// GET /api/vault/review-queue
router.get('/review-queue', async (req, res) => {
  try {
    const queue = await prisma.savedPuzzle.findMany({
      where: {
        userId: req.user.id,
        nextReviewAt: { lte: new Date() }
      },
      orderBy: { nextReviewAt: 'asc' },
      take: 20,
      include: { tags: true }
    });
    res.json({
      queue: queue.map(puzzle => ({ ...puzzle, solution: savedSolution(puzzle) })),
      toleranceCp: attemptTolerance(),
    });
  } catch (err) {
    console.error('Review queue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/attempts', async (req, res) => {
  const { attemptId, moveUci, usedHint, evalLoss, millis } = req.body ?? {};
  if (typeof attemptId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(attemptId)
    || typeof usedHint !== 'boolean' || !Number.isInteger(millis) || millis < 0 || millis > MAX_ATTEMPT_MILLIS
    || (evalLoss !== null && (!Number.isInteger(evalLoss) || evalLoss < 0 || evalLoss > MAX_EVAL_LOSS))) {
    return res.status(400).json({ error: 'Invalid attempt details.' });
  }
  try {
    const userId = req.user.id;
    const puzzle = await prisma.savedPuzzle.findUnique({
      where: { id: req.params.id, userId }, include: { tags: true },
    });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    const solution = savedSolution(puzzle);
    if (!solution) return res.status(422).json({ error: 'This puzzle has no playable solution.' });
    if (!legalAttempt(puzzle.fen, moveUci)) return res.status(400).json({ error: 'That move is illegal in this position.' });
    const exact = moveUci === solution.moves[0].lan;
    const loss = exact ? 0 : solution.mateIn ? null : evalLoss;
    const data = {
      id: attemptId, puzzleId: puzzle.id, userId, moveUci, usedHint, evalLoss: loss, millis,
      correct: exact || (loss !== null && loss <= attemptTolerance()),
      motifs: puzzle.tags.map(tag => tag.name),
    };
    try {
      const attempt = await prisma.attempt.create({ data });
      return res.status(201).json({ attempt });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      const existing = await prisma.attempt.findUnique({ where: { id: attemptId } });
      const same = existing && ['userId', 'puzzleId', 'moveUci', 'usedHint', 'evalLoss', 'millis']
        .every(key => existing[key] === data[key]);
      if (same) return res.json({ attempt: existing });
      return res.status(409).json({ error: 'This attempt ID is already in use.' });
    }
  } catch (err) {
    console.error('Vault attempt error:', err);
    return res.status(500).json({ error: 'Could not record the move attempt.' });
  }
});

// POST /api/vault/:id/review
router.post('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { quality } = req.body ?? {};
    if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
      return res.status(400).json({ error: 'quality must be an integer between 0 and 5' });
    }

    const puzzle = await prisma.savedPuzzle.findUnique({ where: { id }, include: { tags: true } });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });
    if (puzzle.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const next = calculateNextReview({
      easeFactor: puzzle.easeFactor, intervalDays: puzzle.intervalDays, repetitions: puzzle.repetitions, quality,
    });
    const updated = await prisma.$transaction(async tx => {
      const record = await tx.savedPuzzle.update({
        where: { id, lastReviewedAt: puzzle.lastReviewedAt },
        data: { ...next, lastReviewedAt: new Date() },
        include: { tags: true },
      });
      await tx.activityLog.create({
        data: {
          userId: req.user.id, type: 'PUZZLE_REVIEWED', refId: id,
          metadata: { quality, tags: record.tags.map(tag => tag.name) },
        },
      });
      return record;
    });
    res.json({ puzzle: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(409).json({ error: 'This puzzle changed. Reload the review queue.' });
    console.error('Vault review error:', err);
    res.status(500).json({ error: 'Could not save review' });
  }
});

router.patch('/:id/tags', async (req, res) => {
  const names = cleanTags(req.body?.tags);
  if (!names) return res.status(400).json({ error: 'Select up to 12 valid motifs.' });
  try {
    const puzzle = await prisma.savedPuzzle.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { tags: { set: [], connectOrCreate: tagConnections(names) } },
      include: { tags: true },
    });
    res.json({ puzzle });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Puzzle not found' });
    console.error('Vault tags error:', err);
    res.status(500).json({ error: 'Could not save motifs' });
  }
});

router.get('/review-stats', async (req, res) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  try {
    const [reviews, attempts] = await Promise.all([
      prisma.activityLog.findMany({
        where: { userId: req.user.id, type: 'PUZZLE_REVIEWED', createdAt: { gte: since } },
        select: { refId: true, metadata: true, createdAt: true },
      }),
      prisma.attempt.findMany({
        where: { userId: req.user.id, createdAt: { gte: since } },
        select: { createdAt: true, correct: true, motifs: true },
      }),
    ]);
    const legacyIds = [...new Set(reviews.filter(review => !Array.isArray(review.metadata?.tags))
      .map(review => review.refId).filter(Boolean))];
    const legacy = legacyIds.length ? await prisma.savedPuzzle.findMany({
      where: { userId: req.user.id, id: { in: legacyIds } }, select: { id: true, tags: { select: { name: true } } },
    }) : [];
    const legacyTags = new Map(legacy.map(puzzle => [puzzle.id, puzzle.tags.map(tag => tag.name)]));
    const entries = [];
    for (const review of reviews) {
      const { quality, tags } = review.metadata ?? {};
      if (!Number.isInteger(quality) || quality < 0 || quality > 5) continue;
      entries.push({
        createdAt: review.createdAt, correct: quality >= 3,
        motifs: Array.isArray(tags) ? tags : legacyTags.get(review.refId) ?? [],
      });
    }
    res.json({ weeks: weeklyRates(entries), attemptWeeks: weeklyRates(attempts) });
  } catch (err) {
    console.error('Vault stats error:', err);
    res.status(500).json({ error: 'Could not load review history' });
  }
});

module.exports = router;
