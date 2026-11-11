import { ArrowDown, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ChessTraceLogo from '../components/ChessTraceLogo';
import { useAuth } from '../context/AuthContext';
import '../landing.css';

const imageSizes = '(max-width: 760px) calc(100vw - 32px), (max-width: 1350px) 54vw, 752px';

const steps = [
  ['Upload', 'Start with a screenshot of a digital chessboard.'],
  ['Review', 'Check the reconstructed board and correct any uncertain squares.'],
  ['Trace', 'Search the game archive for exact positions and similar structures.'],
  ['Replay', 'Open a match at the position you found and follow the moves.'],
];

export default function Landing() {
  const { token } = useAuth();
  const start = token ? '/lens' : '/auth?mode=register';
  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
        <nav aria-label="Site navigation">
          <a className="landing-nav-workflow" href="#workflow">How it works</a>
          <Link to={token ? '/dashboard' : '/auth'} className="ct-quiet">{token ? 'Open study room' : 'Sign in'}</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <p className="ct-kicker">A study room for chess</p>
            <h1 id="landing-title" className="ct-display">Every position<br />has a history.</h1>
            <p className="landing-lede">Turn a board screenshot into a position you can trace, replay, and study.</p>
            <div className="landing-actions">
              <Link className="ct-button" to={start}>Start studying <ArrowRight size={17} aria-hidden="true" /></Link>
              <a className="landing-text-link" href="#workflow">See the workflow <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </div>
          <figure className="landing-figure">
            <img src="/product/origin-lens.webp" srcSet="/product/origin-lens-720.webp 720w, /product/origin-lens.webp 1100w" sizes={imageSizes} alt="Origin Lens showing a reconstructed board and exact historical matches"
              width="1100" height="715" fetchPriority="high" />
            <figcaption>Origin Lens · Historical match results</figcaption>
          </figure>
        </section>

        <section className="landing-workflow" id="workflow" aria-labelledby="workflow-title">
          <h2 id="workflow-title" className="ct-display">From screenshot to replay</h2>
          <ol>
            {steps.map(([title, detail], index) => (
              <li key={title}>
                <span className="ct-kicker" aria-hidden="true">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-study" aria-labelledby="study-title">
          <div>
            <h2 id="study-title" className="ct-display">Follow the moves.</h2>
            <p>Step through a matched game in Sandbox, compare similar positions, and explore alternatives with Stockfish in your browser.</p>
            <Link to={token ? '/sandbox' : '/auth'} className="ct-quiet">Open Sandbox <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <figure className="landing-figure">
            <img src="/product/sandbox.webp" srcSet="/product/sandbox-720.webp 720w, /product/sandbox.webp 1100w" sizes={imageSizes} alt="Sandbox showing the board, a move list, and Stockfish evaluation"
              width="1100" height="656" loading="lazy" />
            <figcaption>Sandbox · Board, move list, and evaluation</figcaption>
          </figure>
        </section>
      </main>

      <footer className="landing-footer">
        <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
        <Link to={start}>Start studying <ArrowRight size={15} aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
