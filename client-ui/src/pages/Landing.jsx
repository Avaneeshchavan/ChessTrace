import { useEffect } from 'react';
import { ArrowDown, ArrowRight, Bookmark, Camera, ScanLine, Search, Swords } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ChessTraceLogo from '../components/ChessTraceLogo';
import OpeningReplay from '../components/OpeningReplay';
import { useAuth } from '../context/AuthContext';
import { useOnline } from '../hooks/useOnline';
import '../landing.css';

const steps = [
  [Camera, 'Upload a board', 'Start with a screenshot of a digital chessboard.'],
  [ScanLine, 'Check the position', 'Review the reconstructed board and correct any uncertain squares.'],
  [Search, 'Trace its history', 'Find games with the same position or a similar structure, then replay the moves.'],
];

const studyTools = [
  [Swords, 'Sandbox', 'Try a different move and see how Stockfish evaluates it in your browser.', '/sandbox'],
  [Bookmark, 'Pattern Vault', 'Save positions worth revisiting and review them on a spaced repetition schedule.', '/vault'],
];

export default function Landing() {
  const { token } = useAuth();
  const online = useOnline();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#sample-game') document.getElementById('sample-game')?.scrollIntoView();
  }, [hash]);
  const start = online ? (token ? '/lens' : '/auth?mode=register') : '/offline';
  const startLabel = online ? (token ? 'Open Origin Lens' : 'Create an account') : 'Open offline tools';
  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
        <nav aria-label="Site navigation">
          <a className="landing-nav-workflow" href="#workflow">How it works</a>
          <Link to={token ? '/dashboard' : '/auth'} className="ct-quiet">{token ? 'Study room' : 'Sign in'}</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <p className="ct-kicker">A study room for chess</p>
            <h1 id="landing-title" className="ct-display">Every position <em>has a history.</em></h1>
            <p className="landing-lede">Turn a board screenshot into a position you can trace, replay, and study.</p>
            <div className="landing-actions">
              <Link className="ct-button" to={start}>{startLabel} <ArrowRight size={17} aria-hidden="true" /></Link>
              <a className="landing-text-link" href="#sample-game">Try the replay <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </div>
          <OpeningReplay />
        </section>

        <section className="landing-workflow" id="workflow" aria-labelledby="workflow-title">
          <h2 id="workflow-title" className="ct-display">From screenshot to replay</h2>
          <ol>
            {steps.map(([Icon, title, detail]) => (
              <li key={title}>
                <Icon size={21} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-study" aria-labelledby="study-title">
          <h2 id="study-title" className="ct-display">Make the position yours.</h2>
          <div className="landing-tools">
            {studyTools.map(([Icon, title, detail, path]) => (
              <Link key={path} className="landing-tool" to={token ? path : '/auth'} state={{ returnTo: path }}>
                <Icon size={22} aria-hidden="true" />
                <div><h3>{title}</h3><p>{detail}</p></div>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
        <Link to={start}>Start studying <ArrowRight size={15} aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
