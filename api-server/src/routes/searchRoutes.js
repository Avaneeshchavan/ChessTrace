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

router.get('/similar', async (req, res) => {
  const { fenCore, error } = getSearchPosition(req.query.fen);
  if (error) return res.status(400).json({ error });
  const { opening = '', era: decade = '' } = req.query;
  if (typeof opening !== 'string' || opening.length > 80 || typeof decade !== 'string'
    || (decade && !/^(?:1[6-9]\d0|20\d0)$/.test(decade))) {
    return res.status(400).json({ error: 'Enter an opening name or ECO code and select a decade.' });
  }
  try {
    const matches = await findSimilarPositions(prisma, fenCore, 10, {
      opening: opening.trim(), era: decade ? Number(decade) : null,
    });
    res.json({ matches: matches.map(({ startFen, ...match }) => {
      const start = startFen?.trim().split(/\s+/);
      const initialMove = Number(start?.[5]) || 1;
      const plies = match.halfMove - 1 + Number(start?.[1] === 'b');
      return {
        ...match, similarity: 1 / (1 + match.distance),
        moveNumber: initialMove + Math.floor(plies / 2),
        mover: plies % 2 ? 'black' : 'white',
      };
    }) });
  } catch (err) {
    console.error('Similarity search error:', err);
    res.status(500).json({ error: 'Could not find similar positions.' });
  }
});

router.get('/games/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    return res.status(400).json({ error: 'Invalid game ID.' });
  }
  try {
    const game = await prisma.game.findUnique({ where: { id }, select: { pgn: true } });
    if (!game) return res.status(404).json({ error: 'Game is unavailable.' });
    res.json(game);
  } catch (err) {
    console.error('Game replay error:', err);
    res.status(500).json({ error: 'Could not load the game for replay.' });
  }
});

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
