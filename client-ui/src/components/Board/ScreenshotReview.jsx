import { useEffect, useRef, useState } from 'react';
import { Board } from './Board';
import { availableCastling, enPassantTargets, initialSquares, reviewPosition, rotateSquares, SQUARES } from '../../utils/screenshotPosition';

const PIECES = {
  wK: 'White king', wQ: 'White queen', wR: 'White rook', wB: 'White bishop', wN: 'White knight', wP: 'White pawn',
  bK: 'Black king', bQ: 'Black queen', bR: 'Black rook', bB: 'Black bishop', bN: 'Black knight', bP: 'Black pawn',
};

export function ScreenshotReview({ result, searching, offline, onSearch, onEdit = () => {}, onPositionChange, manual = false, knownMetadata = false }) {
  const [squares, setSquares] = useState(() => initialSquares(result));
  const [turn, setTurn] = useState(() => result.fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const [rights, setRights] = useState(() => manual || knownMetadata ? result.fen.split(' ')[2] || '-' : '-');
  const [enPassant, setEnPassant] = useState(() => result.fen.split(' ')[3] || '-');
  const [confirmed, setConfirmed] = useState(knownMetadata);
  const [orientation, setOrientation] = useState(() => result.orientation === 'black_bottom' ? 'black' : 'white');
  const [selected, setSelected] = useState(null);
  const [focused, setFocused] = useState(null);
  const tiles = useRef(new Map());
  const { fen, error } = reviewPosition(squares, turn, rights, enPassant);
  useEffect(() => { onPositionChange?.(fen); }, [fen, onPositionChange]);
  const display = orientation === 'white' ? SQUARES : [...SQUARES].reverse();
  const flagged = display.filter(key => squares[key]?.flagged);
  const available = availableCastling(squares);
  const selectedPiece = selected ? squares[selected]?.piece : null;

  function editMetadata() {
    setConfirmed(false);
    onEdit();
  }

  function setPiece(piece) {
    setSquares(prev => ({ ...prev, [selected]: { piece, flagged: false } }));
    editMetadata();
  }

  function flipDetection() {
    setSquares(rotateSquares);
    setOrientation(current => current === 'white' ? 'black' : 'white');
    setRights('-');
    setSelected(null);
    setEnPassant('-');
    editMetadata();
  }

  return (
    <section className="screenshot-review mt-5 rounded-xl bg-white ring-1 ring-slate-200 p-4 space-y-3" aria-label={manual ? 'Manual board setup' : 'Review detected position'}>
      <div>
        <h2 className="font-semibold text-slate-900">{manual ? 'Set up the position' : 'Review the detected board'}</h2>
        <p className="text-sm text-slate-600">
          {manual ? 'Select a square, choose a piece, then set the side to move.' : 'Select a square to correct its piece, or confirm it is right before searching.'}
        </p>
      </div>
      {!manual && <div className="review-progress">
        <p role="status" className="text-sm font-medium">
          {flagged.length ? `${flagged.length} ${flagged.length === 1 ? 'square needs' : 'squares need'} review` : 'No squares left to review'}
        </p>
      </div>}
      <div className="review-board relative max-w-md mx-auto">
        <span id="detected-board" />
        <Board fen={fen} orientation={orientation} interactive={false} viewOnly />
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8" role="group" aria-label="Editable chess squares. Use arrow keys to move between squares.">
          {display.map((key, index) => {
            const tile = squares[key];
            const name = PIECES[tile?.piece] || 'empty';
            const label = `${key}: ${name}${tile?.flagged ? ', review suggested' : ''}`;
            return (
              <button
                key={key}
                type="button"
                ref={node => { if (node) tiles.current.set(key, node); else tiles.current.delete(key); }}
                tabIndex={key === (focused ?? display[0]) ? 0 : -1}
                onFocus={() => setFocused(key)}
                onKeyDown={event => {
                  const next = { ArrowLeft: index % 8 ? index - 1 : index,
                    ArrowRight: index % 8 < 7 ? index + 1 : index,
                    ArrowUp: index >= 8 ? index - 8 : index,
                    ArrowDown: index < 56 ? index + 8 : index }[event.key];
                  if (next === undefined) return;
                  event.preventDefault();
                  tiles.current.get(display[next])?.focus();
                }}
                aria-label={label}
                aria-pressed={selected === key}
                title={label}
                onClick={() => setSelected(key)}
                className={`relative min-w-0 min-h-0 outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-[var(--ct-ink)] hover:bg-white/20 ${selected === key ? 'ring-2 ring-inset ring-sky-500' : ''}`}
              >
                {tile?.flagged && <span aria-hidden="true" className="absolute inset-[3px] rounded-sm border-2 border-dashed border-red-600 pointer-events-none" />}
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="detected-piece" className="font-medium">Piece on {selected}</label>
          <select id="detected-piece" value={selectedPiece || ''} onChange={event => setPiece(event.target.value || null)}
            className="rounded border border-slate-300 bg-white p-1">
            <option value="">Empty</option>
            {Object.entries(PIECES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          {squares[selected]?.flagged && (
            <button type="button" onClick={() => setPiece(selectedPiece ?? null)} className="ct-quiet">Confirm square</button>
          )}
        </div>
      )}
      {!manual && <fieldset id="review-orientation" className="space-y-2 text-sm">
        <legend className="font-semibold">Board orientation</legend>
        {!knownMetadata && <p className="text-slate-600">Scanner guess: {result.orientation === 'black_bottom' ? 'Black' : 'White'} at bottom.</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Board orientation">
          {['white', 'black'].map(color => <button className="ct-quiet" type="button" key={color}
            aria-pressed={orientation === color} onClick={() => { if (orientation !== color) flipDetection(); }}>
            {color === 'white' ? 'White' : 'Black'} at bottom
          </button>)}
        </div>
      </fieldset>}
      <fieldset id="review-game-state" className="review-metadata space-y-3 text-sm">
        <legend className="font-semibold">{manual ? 'Game state' : 'Confirm these details'}</legend>
        {!manual && <p className="text-slate-600">A screenshot can’t tell whose turn it is, whether castling is still allowed, or what the last move was. Exact search uses the turn and castling rights.</p>}
        <label className="font-medium">
          Side to move{' '}
          <select value={turn} onChange={event => { setTurn(event.target.value); setEnPassant('-'); editMetadata(); }}
            className="rounded border border-slate-300 bg-white p-1">
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <div>
          <p className="font-medium">Castling rights</p>
          <p className="text-xs text-slate-600">Choose only rights you know are still available.</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Castling rights">
            {Object.entries({ K: 'White kingside', Q: 'White queenside', k: 'Black kingside', q: 'Black queenside' }).map(([flag, label]) => (
              <label key={flag} className="inline-flex items-center gap-1">
                <input type="checkbox" disabled={!available.includes(flag)}
                  checked={available.includes(flag) && rights.includes(flag)}
                  onChange={event => {
                    setRights(event.target.checked ? rights.replace('-', '') + flag : rights.replace(flag, ''));
                    editMetadata();
                  }} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="block font-medium">
          En passant target{' '}
          <select value={fen.split(' ')[3]} onChange={event => { setEnPassant(event.target.value); editMetadata(); }}
            className="rounded border border-slate-300 bg-white p-1">
            <option value="-">None or unknown</option>
            {enPassantTargets(squares, turn).map(square => <option key={square} value={square}>{square}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-600">Set this only if the last move was a two-square pawn advance. This field is saved in the position code.</p>
        {!manual && <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          Confirm the game state for exact search
        </label>}
      </fieldset>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Position code (FEN)</summary>
        <p className="mt-2 break-all font-mono text-xs text-slate-600">{fen}</p>
      </details>
      {error && <p role="status" className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={!!error || searching || offline || (!manual && !confirmed)} onClick={() => onSearch(fen)}
        className="ct-button w-full">
        {manual ? 'Use this position' : searching ? 'Searching…' : 'Search this position'}
      </button>
      {!!flagged.length && <div className="review-dock">
        <button type="button" className="ct-quiet" onClick={() => {
          const next = (flagged.indexOf(selected) + 1) % flagged.length;
          setSelected(flagged[next]);
          requestAnimationFrame(() => {
            const field = document.getElementById('detected-piece');
            if (field && field.getBoundingClientRect().bottom > window.innerHeight - 140) {
              field.scrollIntoView({ block: 'center' });
            }
          });
        }}>Review next square</button>
        <span aria-live="polite" className="text-xs">{selected ? `Selected ${selected}` : `${flagged.length} to check`}</span>
      </div>}
    </section>
  );
}
