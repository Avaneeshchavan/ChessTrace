const CP_CLAMP = 800; // beyond +/-8.00, the bar just reads "winning" visually

export function EvalBar({ evaluation, orientation = 'white' }) {
  const whiteFraction = evalToWhiteFraction(evaluation);
  const flipped = orientation === 'black';

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-6 border border-border bg-black rounded-sm"
        style={{ height: 400 }}
        role="meter"
        aria-label="Engine evaluation"
        aria-valuenow={evaluation?.value ?? 0}
      >
        <div
          className="absolute left-0 right-0 bg-white transition-[height] duration-300 rounded-sm"
          style={{
            height: `${(flipped ? 1 - whiteFraction : whiteFraction) * 100}%`,
            [flipped ? 'top' : 'bottom']: 0,
          }}
        />
      </div>
      <span className="font-mono text-data text-text-muted">{formatEval(evaluation)}</span>
    </div>
  );
}

function evalToWhiteFraction(evaluation) {
  if (!evaluation) return 0.5;
  if (evaluation.type === 'mate') {
    return evaluation.value > 0 ? 0.98 : 0.02;
  }
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, evaluation.value));
  return 0.5 + clamped / (CP_CLAMP * 2);
}

function formatEval(evaluation) {
  if (!evaluation) return '—';
  if (evaluation.type === 'mate') return `M${Math.abs(evaluation.value)}`;
  return (evaluation.value / 100).toFixed(2);
}
