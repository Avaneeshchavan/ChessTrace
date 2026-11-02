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
  orientation = 'white',
  turnColor = 'white',
  onMove,
  lowConfidenceSquares = [],
  interactive = true,
  viewOnly = false,
}) {
  const wrapRef = useRef(null);
  const cgRef = useRef(null);

  useEffect(() => {
    cgRef.current = Chessground(wrapRef.current, {
      fen,
      orientation,
      turnColor,
      movable: {
        free: interactive,
        color: interactive ? 'both' : undefined,
        events: {
          after: (orig, dest) => {
            const placement = cgRef.current?.getFen();
            onMove?.(orig, dest, placement);
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
    cgRef.current?.set({ fen, orientation, turnColor });
  }, [fen, orientation, turnColor]);

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

  // ── Compact viewOnly mode (pattern cards, etc.) ──────────────────────────
  // Chessground fills its parent 100%. The wrapper must have explicit dimensions.
  if (viewOnly) {
    return (
      <div className="relative w-full aspect-square overflow-hidden">
        {/* Checkerboard background */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }).map((_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isLight = (row + col) % 2 === 0;
            return <div key={i} className={isLight ? 'bg-[#c7d5e0]' : 'bg-[#598096]'} />;
          })}
        </div>
        {/* Chessground host — must be block-sized to fill parent */}
        <div className="absolute inset-0" ref={wrapRef} />
      </div>
    );
  }

  // ── Full interactive board (Sandbox, OriginLens, etc.) ────────────────────
  return (
    <div className="ct-board-frame relative p-4 pl-6 pb-6 w-fit h-fit shrink-0">
      {/* 64-div Checkerboard Background */}
      <div className="absolute inset-0 m-4 ml-6 mb-6 pointer-events-none grid grid-cols-8 grid-rows-8 rounded-sm overflow-hidden">
        {Array.from({ length: 64 }).map((_, i) => {
          const row = Math.floor(i / 8);
          const col = i % 8;
          // In chess, top-left is a8 (light if a8 is light? No, a8 is light).
          // row=0 col=0 -> a8 -> light. (0+0)%2===0 -> light
          const isLight = (row + col) % 2 === 0;
          return (
            <div
              key={i}
              className={isLight ? "bg-[#c7d5e0]" : "bg-[#598096]"}
            />
          );
        })}
      </div>

      <div
        className="w-[360px] h-[360px] md:w-[560px] md:h-[560px] max-w-full aspect-square relative z-10"
        ref={wrapRef}
      />
    </div>
  );
}
