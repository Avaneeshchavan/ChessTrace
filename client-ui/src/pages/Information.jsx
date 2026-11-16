import { Link } from 'react-router-dom';

function Information({ title, children }) {
  return (
    <main className="ct-workspace ct-information">
      <Link className="ct-quiet" to="/">Back to ChessTrace</Link>
      <h1 className="ct-display mt-5">{title}</h1>
      {children}
      <nav className="mt-6 flex flex-wrap gap-3" aria-label="ChessTrace information">
        <Link className="ct-quiet" to="/about">About and credits</Link>
        <Link className="ct-quiet" to="/privacy">Privacy</Link>
      </nav>
    </main>
  );
}

export function About() {
  return (
    <Information title="About and credits">
      <section>
        <h2>How ChessTrace works</h2>
        <p>Origin Lens crops a chessboard from a screenshot and compares each square with supported piece templates. You can correct the pieces, orientation, side to move, and castling rights. Search compares the reviewed position with the indexed corpus.</p>
        <p>Stockfish analyzes positions in your browser. Twin Game compares opening positions with the corpus and can recognize positions reached in a different move order.</p>
      </section>
      <section>
        <h2>Recognition and coverage</h2>
        <p>Use a clear, flat screenshot of a supported digital board. Photos, unusual piece sets, and cropped squares can reduce accuracy. A screenshot may not show who moves next, castling rights, or move history. Search results depend on the available games and indexed positions.</p>
      </section>
      <section>
        <h2>Data and software</h2>
        <p>The curated tournament corpus uses Lichess Broadcasts under CC BY-SA 4.0. ChessTrace indexes positions and may normalize PGN punctuation or comments for replay. Distributed adaptations carry the same license. <a href="https://database.lichess.org/#broadcasts">Lichess Broadcasts</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></p>
        <p>Stockfish is distributed under GPLv3. <a href="/stockfish/COPYING.txt">License</a> · <a href="https://github.com/lichess-org/stockfish.js/tree/e105072e84cf8ee5dd5219e2c5be29c3b8bf8a5a">Source</a></p>
        <p>ChessTrace is independent of Lichess and Chess.com. Public links from either site are supported for game import.</p>
      </section>
    </Information>
  );
}

export function Privacy() {
  return (
    <Information title="Privacy">
      <section>
        <h2>Your account and activity</h2>
        <p>ChessTrace stores your email address, display name, password hash, saved puzzles, review history, move attempts, and activity timestamps. The browser stores your sign-in token and basic profile so you stay signed in on that device.</p>
      </section>
      <section>
        <h2>Screenshots and game imports</h2>
        <p>Origin Lens sends uploads to the image scanner. The scanner processes the image in memory and discards it after the request. ChessTrace does not retain uploaded screenshots in its database or offline cache. An image shared into the installed app stays in worker memory until the page takes it or the handoff expires.</p>
        <p>Game links are fetched from Lichess or Chess.com. A pasted game used in Twin Game is sent to the API for comparison. If you save an extracted puzzle, ChessTrace stores its position, solution, and tags.</p>
      </section>
      <section>
        <h2>Delete your account</h2>
        <p>Open <Link to="/settings">Settings</Link>, choose <strong>Delete account</strong>, and confirm with your current password. This removes your account, saved puzzles, move attempts, and activity from the active database and signs you out. Hosting backups may retain older copies until they expire.</p>
      </section>
    </Information>
  );
}
