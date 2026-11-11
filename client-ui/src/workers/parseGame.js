import { Chess } from 'chess.js';

self.onmessage = ({ data: pgn }) => {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    if (!history.length) throw new Error('The PGN has no moves.');
    if (history.length > 600) throw new Error('Analyze a PGN with at most 600 half-moves.');
    self.postMessage({ history });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
