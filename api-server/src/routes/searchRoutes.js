const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { findExactMatch, findSimilarPositions } = require('../search');

const router = express.Router();
const prisma = new PrismaClient();

// GET or POST /api/search
// Body/Query: { fen }
router.all('/', async (req, res) => {
  try {
    const fen = req.method === 'POST' ? req.body.fen : req.query.fen;
    if (!fen) {
      return res.status(400).json({ error: 'Missing fen parameter' });
    }

    // Extract fenCore: first 3 parts
    const fenCore = fen.trim().split(/\s+/).slice(0, 3).join(' ');

    let matches = await findExactMatch(prisma, fenCore);
    let matchType = 'exact';

    if (matches.length === 0) {
      matches = await findSimilarPositions(prisma, fenCore, 10);
      matchType = 'similar';
    }

    res.json({ matches, matchType, fenCore });

    // Fire-and-forget logging
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        prisma.activityLog.create({
          data: {
            userId: decoded.id,
            type: 'LENS_SEARCH',
          }
        }).catch(err => console.error("Failed to log activity:", err));
      } catch (e) {
        // invalid token, ignore
      }
    }
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
