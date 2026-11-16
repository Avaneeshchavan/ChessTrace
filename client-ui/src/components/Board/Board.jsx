import { useEffect, useId, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import './Board.css';

/**
 * Thin wrapper: chessground owns the board DOM/drag-and-drop directly
 * (it's not a React-controlled SVG tree), so this component's job is
 * just lifecycle — construct once, push config updates via `.set()`,
 * destroy on unmount — per chessground's own recommended integration
 * pattern for non-vanilla-JS apps.
 */
export function Board({
  fen,
  lastMove,
  orientation = 'white',
  turnColor = 'white',
  onMove,
  lowConfidenceSquares = [],
  destinations,
  hints,
  interactive = true,
  viewOnly = false,
}) {
  const wrapRef = useRef(null);
  const keyboardHelp = useId();
  const [cursor, setCursor] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const initialCursor = orientation === 'white' ? 'e2' : 'e7';
  function announce(square, suffix = '') {
    const piece = cgRef.current?.state.pieces.get(square);
    setAnnouncement(`${square}, ${piece ? piece.color + ' ' + piece.role : 'empty'}${suffix}`);
  }
  function onBoardKey(event) {
    const square = cursor ?? initialCursor;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const direction = orientation === 'white' ? 1 : -1;
    if (Object.hasOwn(arrows, event.key)) {
      event.preventDefault();
      const [dx, dy] = arrows[event.key];
      const file = Math.max(0, Math.min(7, square.charCodeAt(0) - 97 + dx * direction));
      const rank = Math.max(1, Math.min(8, Number(square[1]) + dy * direction));
      const next = String.fromCharCode(97 + file) + rank;
      setCursor(next);
      announce(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      touchMove.current = false;
      cgRef.current?.selectSquare(square);
      announce(square, cgRef.current?.state.selected === square ? ', selected' : '');
    } else if (event.key === 'Escape') {
      cgRef.current?.selectSquare(null);
      announce(square);
    }
  }
  const keyboard = interactive ? {
    role: 'group', tabIndex: 0, 'aria-label': `Interactive chessboard, ${orientation} at bottom`,
    'aria-describedby': keyboardHelp, onKeyDown: onBoardKey,
    onFocus: () => { setCursor(initialCursor); announce(initialCursor); },
    onBlur: () => setCursor(null),
  } : {};
  const controls = interactive && <span id={keyboardHelp} className="sr-only">
    Use arrow keys to choose a square and Enter to select or move a piece.
    <span role="status"> {announcement}</span>
  </span>;
  const cgRef = useRef(null);
  const touchMove = useRef(false);
  const latest = useRef({ fen, onMove });
  useEffect(() => { latest.current = { fen, onMove }; }, [fen, onMove]);
  const movableColor = interactive ? (destinations ? turnColor : 'both') : undefined;

  function startInteraction(event) {
    touchMove.current = event.type === 'touchstart' || event.pointerType === 'touch';
    // A health banner or another sibling can shift the board without resizing it.
    cgRef.current?.state.dom.bounds.clear();
  }

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => cgRef.current?.set({ animation: { enabled: !motion.matches } });
    cgRef.current = Chessground(wrapRef.current, {
      fen,
      ...(lastMove === undefined ? {} : { lastMove }),
      orientation,
      turnColor,
      animation: { enabled: !motion.matches, duration: 240 },
      movable: {
        free: interactive && !destinations,
        color: movableColor,
        dests: destinations,
        events: {
          after: (orig, dest) => {
            const placement = cgRef.current?.getFen();
            if (latest.current.onMove?.(orig, dest, placement) === false) {
              cgRef.current?.set({ fen: latest.current.fen, lastMove: [] });
            } else if (latest.current.onMove && touchMove.current &&
              !window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof navigator.vibrate === 'function') {
              navigator.vibrate(12);
            }
          },
        },
      },
      draggable: { enabled: interactive },
      selectable: { enabled: interactive },
      blockTouchScroll: interactive,
      drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true,
        defaultSnapToValidMove: true,
      },
    });

    motion.addEventListener('change', updateMotion);
    return () => { motion.removeEventListener('change', updateMotion); cgRef.current?.destroy(); };
    // Constructed once; subsequent prop changes flow through .set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cgRef.current?.set({
      fen, orientation, turnColor,
      ...(lastMove === undefined ? {} : { lastMove }),
      movable: { free: interactive && !destinations, color: movableColor, dests: destinations },
      draggable: { enabled: interactive },
      selectable: { enabled: interactive },
      blockTouchScroll: interactive,
    });
  }, [fen, lastMove, orientation, turnColor, interactive, movableColor, destinations]);

  // Mark low-confidence squares directly on the board (dashed red
  // outline via Board.css's `.ct-lowconf`).
  useEffect(() => {
    const boardEl = wrapRef.current?.querySelector('cg-board');
    if (!boardEl) return;
    boardEl.querySelectorAll('square.ct-lowconf').forEach((el) => el.classList.remove('ct-lowconf'));
    cgRef.current?.set({
      highlight: {
        custom: new Map([
          ...lowConfidenceSquares.map(sq => [sq, 'ct-lowconf']),
          ...(hints ?? []).map((sq, index) => [sq, index === 0 ? 'ct-hint-piece' : 'ct-hint-destination']),
          ...(interactive && cursor ? [[cursor, ['ct-keyboard-square',
            hints?.[0] === cursor ? 'ct-hint-piece' : hints?.[1] === cursor ? 'ct-hint-destination' : '',
            lowConfidenceSquares.includes(cursor) ? 'ct-lowconf' : ''].filter(Boolean).join(' ')]] : []),
        ]),
      },
    });
  }, [lowConfidenceSquares, hints, cursor, interactive]);

  if (viewOnly) {
    return (
      <div className="ct-board-surface relative w-full aspect-square overflow-hidden" data-playable={interactive}
        onTouchStartCapture={startInteraction} onPointerDownCapture={startInteraction} {...keyboard}>
        <div className="ct-board-host" ref={wrapRef} />
        {controls}
      </div>
    );
  }

  return (
    <div className="ct-board-frame relative p-4 pl-6 pb-6 w-full max-w-[600px]">
      <div className="ct-board-surface aspect-square relative" data-playable={interactive} ref={wrapRef}
        onTouchStartCapture={startInteraction} onPointerDownCapture={startInteraction} {...keyboard} />
      {controls}
    </div>
  );
}
