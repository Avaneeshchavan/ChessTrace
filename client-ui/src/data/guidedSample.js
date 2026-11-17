import games from './guidedSampleGames.json';

export const sampleFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const placement = 'rnbqkbnrpppppppp....................P...........PPPP.PPPRNBQKBNR';

export const sampleBoard = {
  fen: sampleFen,
  orientation: 'white_bottom',
  squares: [...placement].map((piece, index) => ({
    square: 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8)),
    piece: piece === '.' ? null : (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase(),
    needs_review: false,
  })),
};

export const sampleMatches = {
  matchType: 'exact',
  matches: games.map(({ game: { pgn, ...game }, ...match }) => ({ ...match, game, replayPgn: pgn, id: `sample-${match.gameId}`, nextMove: match.nextMove })),
};
