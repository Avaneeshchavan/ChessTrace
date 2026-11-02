const express = require('express');
const axios = require('axios');

const router = express.Router();

router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    let pgn = '';
    
    if (url.includes('lichess.org')) {
      // e.g. https://lichess.org/aBCdefGh
      const match = url.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid Lichess URL format' });
      }
      const gameId = match[1].slice(0, 8); // remove player perspective if length 12
      
      const response = await axios.get(`https://lichess.org/game/export/${gameId}?tags=true&clocks=false&evals=false`, {
        headers: { Accept: 'text/plain' }
      });
      pgn = response.data;
    } else if (url.includes('chess.com')) {
      // Chess.com PGN fetching requires more complex parsing or using their pub API.
      // E.g., if user provides a live game URL, we'd need to scrape or hit their API.
      // This is a simplified placeholder that expects the client to pass the raw PGN or we'd implement full scraping.
      return res.status(501).json({ error: 'Chess.com fetching not fully implemented in this stub' });
    } else {
      return res.status(400).json({ error: 'Unsupported URL provider' });
    }

    return res.json({ pgn, sourceUrl: url });
  } catch (err) {
    console.error('Game fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch game data' });
  }
});

module.exports = router;
