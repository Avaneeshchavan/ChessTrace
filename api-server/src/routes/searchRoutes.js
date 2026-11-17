const express = require('express');

const { validateFen } = require('chess.js');
const { checkSyntacticLegality } = require('../legality');
const { findExactMatch, findSimilarPositions, findGameReplay, fenCoreToFullFen } = require('../search');
const { positionKey, replayPositionDetails } = require('../compact-position');
const { computeStructuralVector, sharedStructuralFeatures } = require('../vector');
const { authMiddleware } = require('../middleware/authMiddleware');
const { analyzeTwinGame, parseTwinGame } = require('../twin-game');

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

async function exactGameCount(prisma, fenCore) {
  if (process.env.USE_COMPACT_STORAGE === 'true') {
    const row = await prisma.compactPosition.findUnique({ where: { key: positionKey(fenCore), fenCore }, select: { gamesCount: true } });
    return Number(row?.gamesCount ?? 0);
  }
  const [row] = await prisma.$queryRaw`SELECT count(DISTINCT "gameId") AS count FROM "Position" WHERE "fenCore" = ${fenCore}`;
  return Number(row.count);
}

function describeSimilar(fenCore, matches) {
  const query = computeStructuralVector(fenCoreToFullFen(fenCore));
  return matches.map(match => {
    const similarityLabel = match.distance <= .5 ? 'Very similar structure' : match.distance <= 1.5 ? 'Similar structure' : 'Loosely similar structure';
    return { ...match, similarityLabel, sharedFeatures: sharedStructuralFeatures(query, computeStructuralVector(fenCoreToFullFen(match.fenCore))) };
  });
}

function createSearchRouter(prisma = require('../db')) {
  const router = express.Router();

  router.post('/twin', authMiddleware, async (req, res) => {
    let history;
    try { history = parseTwinGame(req.body?.pgn); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      return res.json(await analyzeTwinGame(prisma, history));
    } catch (error) {
      console.error('Twin Game search error:', error);
      return res.status(500).json({ error: 'Could not compare the game with the corpus.' });
    }
  });

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
      res.json({ replayCount: matches.length, matches: describeSimilar(fenCore, matches).map(({ startFen, ...match }) => {
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
      const game = await findGameReplay(prisma, id);
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

      const includeCount = req.query.includeCorpusCount === '1' && matchType === 'similar';
      const corpusGames = includeCount
        ? await (process.env.USE_COMPACT_STORAGE === 'true' ? prisma.compactGame.count() : prisma.game.count())
        : undefined;
      const matchingGameCount = matchType === 'exact' ? await exactGameCount(prisma, fenCore) : 0;
      const cache = new Map();
      const replays = matchType === 'exact' ? matches.map(match => match.positionMove || !match.game?.pgn
        ? match : { ...match, ...replayPositionDetails(match.game.pgn, match.halfMove, cache) }) : describeSimilar(fenCore, matches);
      const replayCount = new Set(replays.map(match => match.gameId ?? match.game?.id)).size;
      res.json({ matches: replays.map(match => ({ ...match, id: String(match.id) })),
        matchType, fenCore, corpusGames, matchingGameCount, replayCount });

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

  return router;
}

module.exports = createSearchRouter;
