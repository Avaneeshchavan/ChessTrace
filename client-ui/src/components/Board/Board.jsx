import { useEffect, useRef } from 'react';
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
  interactive = true,
  viewOnly = false,
}) {
  const wrapRef = useRef(null);
  const cgRef = useRef(null);
  const latest = useRef({ fen, onMove });
  useEffect(() => { latest.current = { fen, onMove }; }, [fen, onMove]);

  useEffect(() => {
    cgRef.current = Chessground(wrapRef.current, {
      fen,
      ...(lastMove === undefined ? {} : { lastMove }),
      orientation,
      turnColor,
      animation: { enabled: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 240 },
      movable: {
        free: interactive,
        color: interactive ? 'both' : undefined,
        events: {
          after: (orig, dest) => {
            const placement = cgRef.current?.getFen();
            if (latest.current.onMove?.(orig, dest, placement) === false) {
              cgRef.current?.set({ fen: latest.current.fen, lastMove: [] });
            }
          },
        },
      },
      draggable: { enabled: interactive },
      drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true,
        defaultSnapToValidMove: true,
      },
    });

    return () => cgRef.current?.destroy();
    // Constructed once; subsequent prop changes flow through .set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cgRef.current?.set({
      fen, orientation, turnColor,
      ...(lastMove === undefined ? {} : { lastMove }),
      movable: { free: interactive, color: interactive ? 'both' : undefined },
      draggable: { enabled: interactive },
    });
  }, [fen, lastMove, orientation, turnColor, interactive]);

  // Mark low-confidence squares directly on the board (dashed red
  // outline via Board.css's `.ct-lowconf`).
  useEffect(() => {
    const boardEl = wrapRef.current?.querySelector('cg-board');
    if (!boardEl) return;
    boardEl.querySelectorAll('square.ct-lowconf').forEach((el) => el.classList.remove('ct-lowconf'));
    cgRef.current?.set({
      highlight: {
        custom: new Map(lowConfidenceSquares.map((sq) => [sq, 'ct-lowconf'])),
      },
    });
  }, [lowConfidenceSquares]);

  if (viewOnly) {
    return (
      <div className="ct-board-surface relative w-full aspect-square overflow-hidden">
        <div className="ct-board-host" ref={wrapRef} />
      </div>
    );
  }

  return (
    <div className="ct-board-frame relative p-4 pl-6 pb-6 w-full max-w-[600px]">
      <div className="ct-board-surface aspect-square relative" ref={wrapRef} />
    </div>
  );
}
