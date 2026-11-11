const express = require('express');
const axios = require('axios');

const router = express.Router();

function parseGameUrl(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname === 'lichess.org' || url.hostname === 'www.lichess.org') {
      const match = url.pathname.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/);
      if (match) return { provider: 'lichess', id: match[1] };
    }
    if (url.hostname === 'chess.com' || url.hostname === 'www.chess.com') {
      const match = url.pathname.match(/^\/(?:analysis\/)?game\/(live|daily)\/(\d{1,20})\/?$/);
      if (match) return { provider: 'chesscom', type: match[1], id: match[2] };
    }
  } catch {
    return null;
  }
  return null;
}

router.post('/fetch', async (req, res) => {
  const { url, username, month } = req.body ?? {};
  const game = parseGameUrl(url);
  if (!game) return res.status(400).json({ error: 'Enter a public Lichess or Chess.com game URL.' });

  const options = { timeout: 10000, maxRedirects: 0, maxContentLength: 8 * 1024 * 1024 };
  try {
    let pgn;
    if (game.provider === 'lichess') {
      const response = await axios.get(`https://lichess.org/game/export/${game.id}?tags=true&clocks=false&evals=false`, {
        ...options, headers: { Accept: 'application/x-chess-pgn' },
      });
      pgn = response.data;
    } else {
      if (typeof username !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(username)
        || typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ error: 'Enter either player’s Chess.com username and the month the game ended.' });
      }
      const [year, calendarMonth] = month.split('-');
      const response = await axios.get(
        `https://api.chess.com/pub/player/${username.toLowerCase()}/games/${year}/${calendarMonth}`,
        { ...options, headers: { 'User-Agent': 'ChessTrace game importer' } },
      );
      pgn = response.data?.games?.find(entry => {
        const archived = parseGameUrl(entry.url);
        return archived?.provider === 'chesscom' && archived.type === game.type && archived.id === game.id
          && (!entry.rules || entry.rules === 'chess');
      })?.pgn;
    }
    if (typeof pgn !== 'string' || !pgn.trim()) {
      return res.status(404).json({ error: 'No completed standard game found. Check the game details or paste its PGN.' });
    }
    return res.json({ pgn, sourceUrl: url });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'That game or archive month is unavailable. Check the details or paste its PGN.' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'The game provider is rate limiting requests. Try again shortly or paste the PGN.' });
    }
    return res.status(502).json({ error: 'The game provider did not respond. Try again or paste the PGN.' });
  }
});

module.exports = router;
