function annotation(move) {
  if (move.san.endsWith('#')) return 'Checkmate';
  if (move.promotion) return 'Promotion';
  if (move.san.endsWith('+')) return 'Check';
  if (move.captured) return 'Capture';
  return null;
}

export function MoveLedger({ moves, ply = moves.length, onSelect, comments }) {
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
    const text = <>{move.san}{note && <span className="ml-1.5 text-[0.65rem] text-accent">{note}</span>}</>;
    return onSelect
      ? <button type="button" aria-current={ply === index ? 'step' : undefined} onClick={() => onSelect(index)}>{text}</button>
      : <span>{text}</span>;
  }

  const comment = ply > 0 && comments?.get(moves[ply - 1]?.after);
  return (
    <section aria-label="Move list">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold">Move list</h3>
        <span className="font-mono text-xs text-slate-500">{moves.length} half-moves</span>
      </div>
      <div className="move-ledger font-mono text-xs">
        {rows.size ? [...rows.values()].map(row => (
          <div className="move-ledger-row" key={row.number}>
            <span className="text-slate-500">{row.number}.</span>{cell(row.w)}{cell(row.b)}
          </div>
        )) : <p className="text-slate-500">Play a move to start the list.</p>}
      </div>
      {comment && <p className="border-t border-slate-200 px-3 py-2 text-sm text-slate-600">{comment}</p>}
    </section>
  );
}
