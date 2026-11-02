import { useState } from 'react';
import { fensAlongMoveSequence } from '../../lib/fen.js';

export function GameResultCard({ match, distance, onPreviewFen }) {
  const [expanded, setExpanded] = useState(false);
  const [ply, setPly] = useState(0);

  const fens = expanded ? fensAlongMoveSequence(match.moveSequence || []) : [];

  const step = (delta) => {
    const next = Math.max(0, Math.min(fens.length - 1, ply + delta));
    setPly(next);
    onPreviewFen?.(fens[next]);
  };

  return (
    <div className="border border-slate-200 bg-slate-50 rounded-md">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-baseline justify-between hover:bg-slate-100 transition-colors"
      >
        <span className="font-body text-body text-slate-800">
          {match.players?.white} <span className="text-slate-500">vs</span>{' '}
          {match.players?.black}
        </span>
        <span className="font-mono text-eyebrow uppercase tracking-[.09em] text-slate-500">
          {match.event} · {match.year}
          {typeof distance === 'number' ? ` · d=${distance.toFixed(3)}` : ''}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex items-center gap-3 border-t border-slate-200 pt-2">
          <button
            onClick={() => step(-1)}
            className="font-mono text-data px-2 border border-slate-200 hover:bg-[#3b82f6] hover:text-white rounded-sm text-slate-700"
          >
            ←
          </button>
          <span className="font-mono text-data text-slate-500">
            ply {ply + 1} / {fens.length || 1}
          </span>
          <button
            onClick={() => step(1)}
            className="font-mono text-data px-2 border border-slate-200 hover:bg-[#3b82f6] hover:text-white rounded-sm text-slate-700"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
