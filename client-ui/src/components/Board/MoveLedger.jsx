import { parsePgnComment } from '../../utils/pgnComment';

function annotation(move) {
  if (move.san.endsWith('#')) return 'Checkmate';
  if (move.promotion) return 'Promotion';
  if (move.san.endsWith('+')) return 'Check';
  if (move.captured) return 'Capture';
  return null;
}

export function MoveLedger({ moves, ply = moves.length, onSelect, comments, heading: Heading = 'h3' }) {
  const rows = new Map();
  for (const [index, move] of moves.entries()) {
    const number = move.before.split(' ')[5];
    const row = rows.get(number) ?? { number };
    row[move.color] = { move, index: index + 1 };
    rows.set(number, row);
  }

  function cell(entry) {
    if (!entry) return <span />;
    const { move, index } = entry;
    const note = annotation(move);
    const text = <>{move.san}{note && <span className="ml-1.5 text-xs text-accent">{note}</span>}</>;
    return onSelect
      ? <button type="button" aria-current={ply === index ? 'step' : undefined} onClick={() => onSelect(index)}>{text}</button>
      : <span>{text}</span>;
  }

  const comment = ply > 0 && comments?.get(moves[ply - 1]?.after);
  const parsed = comment ? parsePgnComment(comment) : null;
  return (
    <section aria-label="Move list">
      <div className="px-3 py-2">
        <Heading className="text-sm font-semibold">Move list</Heading>
      </div>
      <div className="move-ledger font-mono text-xs">
        {rows.size ? [...rows.values()].map(row => (
          <div className="move-ledger-row" key={row.number}>
            <span className="text-slate-500">{row.number}.</span>{cell(row.w)}{cell(row.b)}
          </div>
        )) : <p className="text-slate-500">Play a move to start the list.</p>}
      </div>
      {parsed?.text && <p className="border-t border-slate-200 px-3 py-2 text-sm text-slate-600">{parsed.text}</p>}
      {!!parsed?.annotations.length && <details className="px-3 py-2 text-sm">
        <summary>Move details</summary>
        <dl>{parsed.annotations.map(({ label, value }, index) => (
          <div key={index} className="flex gap-2"><dt>{label}</dt><dd className="text-slate-500">{value}</dd></div>
        ))}</dl>
      </details>}
    </section>
  );
}
