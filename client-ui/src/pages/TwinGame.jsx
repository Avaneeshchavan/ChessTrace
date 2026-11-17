import { useEffect, useRef, useState } from 'react';
import { GameInput } from '../components/Game/GameInput';
import { GameReplay } from '../components/Board/GameReplay';
import { importGame } from '../utils/importGame';
import { API_BASE_URL } from '../config/api';
import { fetchService } from '../config/serviceRequest';
import { useAuth } from '../context/AuthContext';
import { useOnline } from '../hooks/useOnline';

const number = new Intl.NumberFormat();
const moveLabel = ({ moveNumber, color, san }) => `${moveNumber}${color === 'w' ? '.' : '…'} ${san}`;

function Timeline({ timeline, departurePly, threshold }) {
  const track = useRef(null);
  const marker = useRef(null);
  useEffect(() => {
    if (!track.current || !marker.current) return;
    const area = track.current.getBoundingClientRect();
    const move = marker.current.getBoundingClientRect();
    if (move.bottom > area.bottom) track.current.scrollTop += move.bottom - area.bottom + 8;
    if (move.right > area.right) track.current.scrollLeft += move.right - area.right + 8;
  }, [departurePly, timeline]);
  return (
    <section className="ct-panel twin-panel" aria-labelledby="twin-timeline">
      <h2 id="twin-timeline">Opening timeline</h2>
      <ol ref={track} className="twin-timeline" tabIndex={0} aria-label="Positions and matching games">
        {timeline.map(move => {
          const departed = move.ply === departurePly + 1;
          const matched = move.games >= threshold;
          return <li key={move.ply} ref={departed ? marker : undefined} data-matched={matched} data-departure={departed}>
            <strong>{moveLabel(move)}</strong>
            <span>{number.format(move.games)} {move.games === 1 ? 'game' : 'games'}</span>
            {departed && <span className="twin-departure">Departure</span>}
          </li>;
        })}
      </ol>
    </section>
  );
}

function TwinResults({ result }) {
  const [replay, setReplay] = useState(false);
  const { timeline, departurePly, threshold, corpusGames, indexedPlies, twin, variations, replaySample, anchorGames } = result;
  const departureMove = timeline[departurePly];
  const alternatives = variations.filter(move => move.lan !== departureMove?.lan);
  const lead = alternatives[0];
  const matchingPlayed = variations.find(move => move.lan === departureMove?.lan);
  const openReplay = () => setReplay(value => !value);
  return (
    <div className="space-y-4">
      <section className="ct-panel twin-panel" aria-labelledby="twin-summary">
        <h2 id="twin-summary">{!corpusGames ? 'No corpus games available'
          : !departureMove ? 'This game stayed in the indexed line'
            : departurePly ? `You left the indexed line at ${moveLabel(departureMove)}`
              : 'The opening stayed below the match threshold'}</h2>
        <p>Based on {number.format(corpusGames)} corpus {corpusGames === 1 ? 'game' : 'games'}. Match threshold: {threshold} {threshold === 1 ? 'game' : 'games'}.</p>
        {anchorGames !== null && <p>{number.format(anchorGames)} games reached the last shared position above the threshold.</p>}
        {indexedPlies !== null && <p>The active storage profile indexes the first {indexedPlies} half-moves of each corpus game.</p>}
      </section>
      <Timeline {...result} />
      {departureMove && <section className="twin-compare" aria-label="Compare the next moves">
        <article className="ct-panel twin-panel">
          <h2>You played</h2>
          <p className="twin-move">{moveLabel(departureMove)}</p>
          <p>{number.format(departureMove.games)} {departureMove.games === 1 ? 'game reached' : 'games reached'} the resulting position.</p>
          {matchingPlayed && <p>{matchingPlayed.games} {matchingPlayed.games === 1 ? 'sampled game played' : 'sampled games played'} this move from the shared position.</p>}
        </article>
        <article className="ct-panel twin-panel">
          <h2>What the corpus played</h2>
          {lead ? <>
            <p className="twin-move">{lead.san}</p>
            <p>{lead.games} {lead.games === 1 ? 'game' : 'games'} · {lead.whiteWins} white wins · {lead.draws} draws · {lead.blackWins} black wins
              {!!lead.other && ` · ${lead.other} other`}</p>
          </> : <p>No different continuation was available in the replay sample.</p>}
          <p>Based on {replaySample} replayable {replaySample === 1 ? 'game' : 'games'} at the shared position.</p>
        </article>
      </section>}
      {twin && <section className="ct-panel twin-panel" aria-labelledby="twin-replay">
        <h2 id="twin-replay">Closest corpus game</h2>
        <p>{twin.whiteName} vs. {twin.blackName}</p>
        {twin.transposed && <p>The shared position was reached by a different move order.</p>}
        <button type="button" className="ct-button" aria-expanded={replay} onClick={openReplay}>
          {replay ? 'Close replay' : departureMove ? 'Replay twin from the departure' : 'Replay twin from the last match'}
        </button>
        {replay && <GameReplay match={twin} />}
      </section>}
    </div>
  );
}

export default function TwinGame() {
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [month, setMonth] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(null);
  const { token } = useAuth();
  const online = useOnline();
  useEffect(() => () => active.current?.abort(), []);

  async function compare(event) {
    event.preventDefault();
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const pgn = await importGame({ input, username, month, signal: controller.signal });
      const response = await fetchService(API_BASE_URL, '/api/search/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pgn }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not compare the game.');
      if (!controller.signal.aborted) setResult(data);
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message || 'Could not compare the game.');
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <main className="ct-workspace twin-workspace">
      <header className="ct-workspace-header">
        <h1>Twin Game</h1>
        <p>Find where your opening diverged from the corpus and replay the closest game.</p>
      </header>
      <form onSubmit={compare} className="ct-panel twin-panel twin-form">
        <GameInput input={input} setInput={setInput} username={username} setUsername={setUsername}
          month={month} setMonth={setMonth} disabled={busy} required placeholder="Lichess link, Chess.com link, or PGN" />
        <button type="submit" className="ct-button" disabled={!online || busy}>{busy ? 'Comparing…' : 'Find my twin game'}</button>
        {!online && <p role="status">Connect to the internet to compare a game.</p>}
      </form>
      {busy && <p role="status" className="my-4 text-sm text-slate-500">Checking positions in the corpus…</p>}
      {error && <p role="alert" className="my-4 text-sm text-red-700">{error}</p>}
      {result && <TwinResults result={result} />}
    </main>
  );
}
