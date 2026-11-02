import { useState } from 'react';
import { checkSyntacticLegality } from '../../lib/fen.js';
import { Switch } from '../ui/Switch.jsx';
import { Slider } from '../ui/Slider.jsx';

export function SandboxControls({
  fen,
  orientation,
  onFlipOrientation,
  onToggleSideToMove,
  onSetFen,
  depth,
  onSetDepth,
}) {
  const [draft, setDraft] = useState(fen);
  const legality = checkSyntacticLegality(draft);

  const applyDraft = () => {
    if (legality.legal) onSetFen(draft);
  };

  const isBlackToMove = fen.split(' ')[1] === 'b';
  const isBlackOrientation = orientation === 'black';

  return (
    <div className="flex flex-col gap-5 w-full">
      <span className="font-display text-h2 font-semibold text-slate-900">Sandbox</span>

      <div className="flex flex-col sm:flex-row gap-2">
        <Switch
          label="Black Orientation"
          checked={isBlackOrientation}
          onToggle={onFlipOrientation}
          className="flex-1"
        />
        <Switch
          label="Black to move"
          checked={isBlackToMove}
          onToggle={onToggleSideToMove}
          className="flex-1"
        />
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="flex justify-between font-mono text-eyebrow uppercase tracking-[.09em] text-slate-600">
          <span>Engine Search Depth</span>
          <span>{depth}</span>
        </label>
        <Slider
          value={[depth]}
          onValueChange={(val) => onSetDepth(val[0])}
          min={1}
          max={24}
          step={1}
          aria-label="Engine Depth"
        />
      </div>

      <div>
        <label className="block font-mono text-eyebrow uppercase tracking-[.09em] text-slate-600 mb-1">
          FEN
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyDraft}
          rows={2}
          className={`w-full font-mono text-sm p-3 border bg-slate-50 text-slate-900 resize-none rounded-md ${
            legality.legal ? 'border-slate-300' : 'border-red-500'
          }`}
        />
        {!legality.legal && (
          <p className="font-mono text-eyebrow text-red-500 mt-1">
            {legality.reason} — checked for syntactic legality only, per Phase 1's scope; this
            is not a full game-history validity check.
          </p>
        )}
      </div>
    </div>
  );
}
