const express = require('express');
const prisma = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');

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
    const { fen, initialMove, solutionPgn, tags = [] } = req.body;
    
    if (!fen) {
      return res.status(400).json({ error: 'fen is required' });
    }

    const names = cleanTags(tags);
    if (!names) return res.status(400).json({ error: 'Select up to 12 valid motifs.' });

    const puzzle = await prisma.savedPuzzle.create({
      data: {
        userId: req.user.id,
        fen,
        initialMove,
        solutionPgn,
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
    res.json({ queue });
  } catch (err) {
    console.error('Review queue error:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    const reviews = await prisma.activityLog.findMany({
      where: { userId: req.user.id, type: 'PUZZLE_REVIEWED', createdAt: { gte: since } },
      select: { refId: true, metadata: true, createdAt: true },
    });
    const legacyIds = [...new Set(reviews.filter(review => !Array.isArray(review.metadata?.tags))
      .map(review => review.refId).filter(Boolean))];
    const legacy = legacyIds.length ? await prisma.savedPuzzle.findMany({
      where: { userId: req.user.id, id: { in: legacyIds } }, select: { id: true, tags: { select: { name: true } } },
    }) : [];
    const legacyTags = new Map(legacy.map(puzzle => [puzzle.id, puzzle.tags.map(tag => tag.name)]));
    const buckets = new Map();
    for (const review of reviews) {
      const { quality, tags } = review.metadata ?? {};
      if (!Number.isInteger(quality) || quality < 0 || quality > 5) continue;
      const weekStart = new Date(review.createdAt);
      weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
      const week = weekStart.toISOString().slice(0, 10);
      for (const motif of new Set(Array.isArray(tags) ? tags : legacyTags.get(review.refId) ?? [])) {
        const key = JSON.stringify([motif, week]);
        const bucket = buckets.get(key) ?? { motif, week, solved: 0, attempts: 0 };
        bucket.attempts++;
        if (quality >= 3) bucket.solved++;
        buckets.set(key, bucket);
      }
    }
    res.json({ weeks: [...buckets.values()].sort((a, b) => a.week.localeCompare(b.week)) });
  } catch (err) {
    console.error('Vault stats error:', err);
    res.status(500).json({ error: 'Could not load review history' });
  }
});

module.exports = router;
