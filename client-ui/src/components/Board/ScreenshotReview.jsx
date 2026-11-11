import { useState } from 'react';
import { Board } from './Board';
import { availableCastling, initialSquares, reviewPosition, rotateSquares, SQUARES } from '../../utils/screenshotPosition';

const PIECES = {
  wK: 'White king', wQ: 'White queen', wR: 'White rook', wB: 'White bishop', wN: 'White knight', wP: 'White pawn',
  bK: 'Black king', bQ: 'Black queen', bR: 'Black rook', bB: 'Black bishop', bN: 'Black knight', bP: 'Black pawn',
};

export function ScreenshotReview({ result, searching, onSearch, onEdit }) {
  const [squares, setSquares] = useState(() => initialSquares(result));
  const [turn, setTurn] = useState(() => result.fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const [rights, setRights] = useState(() => result.fen.split(' ')[2] || '-');
  const [orientation, setOrientation] = useState(() => result.orientation === 'black_bottom' ? 'black' : 'white');
  const [selected, setSelected] = useState(null);
  const { fen, error } = reviewPosition(squares, turn, rights);
  const display = orientation === 'white' ? SQUARES : [...SQUARES].reverse();
  const flagged = display.filter(key => squares[key]?.flagged);
  const available = availableCastling(squares);
  const selectedPiece = selected ? squares[selected]?.piece : null;

  function setPiece(piece) {
    setSquares(prev => ({ ...prev, [selected]: { piece, flagged: false } }));
    onEdit();
  }

  function flipDetection() {
    setSquares(rotateSquares);
    setOrientation(current => current === 'white' ? 'black' : 'white');
    setRights('-');
    setSelected(null);
    onEdit();
  }

  return (
    <section className="screenshot-review mt-5 rounded-xl bg-white ring-1 ring-slate-200 p-4 space-y-3" aria-label="Review detected position">
      <div>
        <h3 className="font-semibold text-slate-900">Review the detected board</h3>
        <p className="text-sm text-slate-600">
          Select a square to correct its piece, or confirm it is right before searching.
        </p>
      </div>
      <div className="review-progress">
        <p role="status" className="text-sm font-medium">
          {flagged.length ? `${flagged.length} ${flagged.length === 1 ? 'square needs' : 'squares need'} review` : 'No squares left to review'}
        </p>
        {!!flagged.length && <button type="button" className="ct-quiet" onClick={() => {
          const next = (flagged.indexOf(selected) + 1) % flagged.length;
          setSelected(flagged[next]);
        }}>Review next square</button>}
      </div>
      <div className="relative max-w-md mx-auto">
        <Board fen={fen} orientation={orientation} interactive={false} viewOnly />
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8" aria-label="Editable chess squares">
          {display.map(key => {
            const tile = squares[key];
            const name = PIECES[tile?.piece] || 'empty';
            const score = tile?.confidence == null ? '' : `, score ${Math.round(tile.confidence * 100)}%`;
            const label = `${key}: ${name}${score}${tile?.flagged ? ', review suggested' : ''}`;
            return (
              <button
                key={key}
                type="button"
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
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="font-medium">
          Side to move{' '}
          <select value={turn} onChange={event => { setTurn(event.target.value); onEdit(); }} className="rounded border border-slate-300 bg-white p-1">
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <button type="button" onClick={flipDetection} className="review-text-action text-sky-800 underline">Reverse detected orientation</button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Castling rights</summary>
        <p className="mt-2 text-xs text-slate-500">Set the rights from the original game if you know them.</p>
        <fieldset className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Castling rights">
          {Object.entries({ K: 'White kingside', Q: 'White queenside', k: 'Black kingside', q: 'Black queenside' }).map(([flag, label]) => (
            <label key={flag} className="inline-flex items-center gap-1">
              <input type="checkbox" disabled={!available.includes(flag)}
                checked={available.includes(flag) && rights.includes(flag)}
                onChange={event => {
                  setRights(event.target.checked ? rights.replace('-', '') + flag : rights.replace(flag, ''));
                  onEdit();
                }} />
              {label}
            </label>
          ))}
        </fieldset>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Position code (FEN)</summary>
        <p className="mt-2 break-all font-mono text-xs text-slate-600">{fen}</p>
      </details>
      {error && <p role="status" className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={!!error || searching} onClick={() => onSearch(fen)}
        className="ct-button w-full">
        {searching ? 'Searching…' : 'Search this position'}
      </button>
    </section>
  );
}
