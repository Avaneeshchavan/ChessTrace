const express = require('express');
const { calculateStreak } = require('../utils/streak');
const prisma = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Stats
    const totalPuzzles = await prisma.savedPuzzle.count({ where: { userId } });
    const totalSearches = await prisma.activityLog.count({
      where: { userId, type: 'LENS_SEARCH' }
    });
    const totalTurningPoints = await prisma.activityLog.count({
      where: { userId, type: 'TURNING_POINTS_RUN' }
    });

    // 2. Recent Activity
    const recentActivity = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // 3. Heatmap Data (Last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const logs = await prisma.activityLog.findMany({
      where: {
        userId,
        createdAt: { gte: ninetyDaysAgo }
      },
      select: { createdAt: true }
    });

    const heatmap = {};
    for (const log of logs) {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      heatmap[dateStr] = (heatmap[dateStr] || 0) + 1;
    }

    // 4. Streak Logic
    const allLogs = await prisma.activityLog.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    const streak = calculateStreak(allLogs);

    res.json({
      stats: {
        totalPuzzles,
        totalSearches,
        totalTurningPoints,
      },
      streak,
      heatmap,
      recentActivity
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/activity', async (req, res) => {
  try {
    const { type, metadata } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    const log = await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        type,
        metadata: metadata || {}
      }
    });

    res.status(201).json({ log });
  } catch (err) {
    console.error('Dashboard activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
