const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/authMiddleware');
const { calculateStreak } = require('../utils/streak');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// PATCH /api/users/me (Update Display Name)
router.patch('/me', async (req, res) => {
  try {
    let { displayName } = req.body;
    
    if (displayName === undefined) {
      return res.status(400).json({ error: 'displayName is required' });
    }

    displayName = displayName.trim();
    
    if (displayName.length === 0) {
      return res.status(400).json({ error: 'displayName cannot be empty' });
    }
    
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'displayName cannot exceed 50 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.displayName === displayName) {
      return res.json({ id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { displayName }
    });

    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      createdAt: updatedUser.createdAt
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/me/password (Change Password)
router.post('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/summary (Account Summary)
router.get('/me/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const totalPuzzlesSaved = await prisma.savedPuzzle.count({ where: { userId } });

    const allLogs = await prisma.activityLog.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    const currentStreakDays = calculateStreak(allLogs);

    res.json({
      email: user.email,
      displayName: user.displayName,
      memberSince: user.createdAt,
      totalPuzzlesSaved,
      currentStreakDays
    });
  } catch (err) {
    console.error('Account summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
