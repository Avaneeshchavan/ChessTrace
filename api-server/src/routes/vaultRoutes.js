const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

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

    const tagConnectOrCreate = tags.map(t => ({
      where: { name: t },
      create: { name: t },
    }));

    const puzzle = await prisma.savedPuzzle.create({
      data: {
        userId: req.user.id,
        fen,
        initialMove,
        solutionPgn,
        tags: {
          connectOrCreate: tagConnectOrCreate,
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
        metadata: tags.length > 0 ? { theme: tags[0] } : {},
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
    const { quality } = req.body;
    
    if (quality === undefined || quality < 0 || quality > 5) {
      return res.status(400).json({ error: 'quality must be between 0 and 5' });
    }

    const puzzle = await prisma.savedPuzzle.findUnique({ where: { id } });
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    if (puzzle.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { easeFactor, intervalDays, repetitions, nextReviewAt } = calculateNextReview({
      easeFactor: puzzle.easeFactor,
      intervalDays: puzzle.intervalDays,
      repetitions: puzzle.repetitions,
      quality: Number(quality)
    });

    const updated = await prisma.savedPuzzle.update({
      where: { id },
      data: {
        easeFactor,
        intervalDays,
        repetitions,
        nextReviewAt,
        lastReviewedAt: new Date()
      },
      include: { tags: true }
    });

    prisma.activityLog.create({
      data: {
        userId: req.user.id,
        type: 'PUZZLE_REVIEWED',
        refId: puzzle.id,
        metadata: { quality }
      }
    }).catch(err => console.error("Failed to log activity:", err));

    res.json({ puzzle: updated });
  } catch (err) {
    console.error('Vault review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
