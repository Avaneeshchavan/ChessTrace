const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validateFen } = require('chess.js');
const { checkSyntacticLegality } = require('../legality');
const { findExactMatch, findSimilarPositions, fenCoreToFullFen } = require('../search');

const router = express.Router();
const prisma = new PrismaClient();

function getSearchPosition(fen) {
  if (typeof fen !== 'string' || !fen.trim() || fen.length > 200) {
    return { error: 'Enter a FEN position.' };
  }
  const fields = fen.trim().split(/\s+/);
  if (![3, 6].includes(fields.length)) return { error: 'FEN must have three or six fields.' };
  const fenCore = fields.slice(0, 3).join(' ');
  const fullFen = fields.length === 3 ? fenCoreToFullFen(fenCore) : fields.join(' ');
  const format = validateFen(fullFen);
  if (!format.ok) return { error: format.error };
  const legality = checkSyntacticLegality(fenCore);
  if (!legality.legal) return { error: legality.reasons.join(' ') };
  return { fenCore };
}

// GET or POST /api/search
// Body/Query: { fen }
router.all('/', async (req, res) => {
  try {
    const fen = req.method === 'POST' ? req.body?.fen : req.query.fen;
    const { fenCore, error } = getSearchPosition(fen);
    if (error) return res.status(400).json({ error });

    let matches = await findExactMatch(prisma, fenCore);
    let matchType = 'exact';

    if (matches.length === 0) {
      matches = await findSimilarPositions(prisma, fenCore, 10);
      matchType = 'similar';
    }

    res.json({ matches: matches.map(match => ({ ...match, id: String(match.id) })), matchType, fenCore });

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
