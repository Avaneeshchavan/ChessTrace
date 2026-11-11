const CP_CLAMP = 800;

export function EvalBar({ evaluation, orientation = 'white' }) {
  const whiteScore = evaluation?.type === 'mate'
    ? Math.sign(evaluation.value) * CP_CLAMP
    : Math.max(-CP_CLAMP, Math.min(CP_CLAMP, evaluation?.value ?? 0));
  const fraction = 50 + whiteScore / CP_CLAMP * 50;
  const label = !evaluation ? 'Waiting' : evaluation.type === 'mate'
    ? `${evaluation.value < 0 ? '−' : '+'}M${Math.abs(evaluation.value)}`
    : `${evaluation.value > 0 ? '+' : ''}${(evaluation.value / 100).toFixed(2)}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="eval-track" role="meter" aria-label="White evaluation"
        aria-valuemin={-CP_CLAMP} aria-valuemax={CP_CLAMP} aria-valuenow={whiteScore} aria-valuetext={label}>
        <div className="eval-fill" style={{
          height: `${Math.max(2, Math.min(98, fraction))}%`,
          ...(orientation === 'black' ? { top: 0, bottom: 'auto' } : {}),
        }} />
        <div className="eval-midpoint" />
      </div>
      <span className="font-mono text-xs text-slate-500">{!evaluation ? '—' : label}</span>
    </div>
  );
}
