import { useState } from 'react';
import { Chess } from 'chess.js';
import { ArrowLeft, ArrowRight, RotateCcw, ScanLine } from 'lucide-react';
import { Board } from './Board/Board';

const game = new Chess();
game.loadPgn('1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#');
const moves = game.history({ verbose: true });
const start = moves[0].before;
const chapters = [
  { ply: 10, name: 'The opening', note: 'Morphy brings his queen out early. His bishop will soon join the attack on f7.' },
  { ply: 27, name: 'The pin', note: 'White doubles up on the d-file. The knight on f6 is pinned to Black’s queen.' },
  { ply: 33, name: 'The finish', note: 'Morphy gives up his queen on b8 to clear the way for Rd8 mate.' },
];

function moveLabel(ply) {
  if (ply === 0) return 'Starting position';
  return Math.ceil(ply / 2) + (ply % 2 ? '. ' : '… ') + moves[ply - 1].san;
}

export default function OpeningReplay() {
  const [ply, setPly] = useState(chapters[0].ply);
  const [orientation, setOrientation] = useState('white');
  const chapter = chapters.findLast(item => item.ply <= ply) ?? chapters[0];
  const move = moves[ply - 1];
  const players = orientation === 'white' ? ['black', 'white'] : ['white', 'black'];
  const player = color => (
    <div className="opening-player">
      <span className={'opening-color opening-color-' + color} aria-hidden="true" />
      {color === 'white' ? 'Paul Morphy' : 'Duke of Brunswick & Count Isouard'}
    </div>
  );
  const step = delta => setPly(current => Math.min(moves.length, Math.max(0, current + delta)));

  return (
    <section className="opening-replay" id="sample-game" aria-labelledby="sample-title">
      <header className="opening-replay-header">
        <span className="opening-replay-icon"><ScanLine size={19} aria-hidden="true" /></span>
        <div>
          <p className="opening-replay-label">Interactive game preview</p>
          <h2 id="sample-title">The Opera Game</h2>
        </div>
        <span className="opening-replay-date">Paris, 1858</span>
      </header>
      <div className="opening-replay-body">
        <div className="opening-board">
          {player(players[0])}
          <div role="img" aria-label={'Chess position after ' + (move ? moveLabel(ply) : 'setting up the board')}>
            <Board fen={move?.after ?? start} orientation={orientation} interactive={false} viewOnly lastMove={move ? [move.from, move.to] : []} />
          </div>
          {player(players[1])}
        </div>
        <div className="opening-replay-details">
          <div className="opening-chapters" role="group" aria-label="Jump to a moment in the game">
            {chapters.map(item => (
              <button key={item.ply} type="button" aria-pressed={item.ply === chapter.ply} onClick={() => setPly(item.ply)}>{item.name}</button>
            ))}
          </div>
          <div className="opening-caption">
            <p className="opening-current" aria-live="polite">{moveLabel(ply)}</p>
            <p>{chapter.note}</p>
          </div>
          <div className="opening-controls" role="group" aria-label="Replay controls" onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              step(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}>
            <button type="button" aria-label="Previous move" disabled={ply === 0} onClick={() => step(-1)}><ArrowLeft size={18} /></button>
            <button type="button" aria-label="Next move" disabled={ply === moves.length} onClick={() => step(1)}><ArrowRight size={18} /></button>
            <button type="button" aria-label="Flip board" onClick={() => setOrientation(current => current === 'white' ? 'black' : 'white')}><RotateCcw size={17} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
