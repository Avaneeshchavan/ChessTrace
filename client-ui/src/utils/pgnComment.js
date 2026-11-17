export function parsePgnComment(comment) {
  const annotations = [];
  const text = comment.replace(/\[%([\w-]+)(?:\s+([^\]]*))?\]/g, (_, name, value = '') => {
    const raw = value.trim();
    if (name === 'eval' && /^[+-]?(?:\d+(?:\.\d+)?|#[-+]?\d+)(?:,\d+)?$/.test(raw)) {
      const score = raw.split(',')[0];
      annotations.push({ label: 'Evaluation', value: score.startsWith('#') ? `Mate in ${score.slice(1)}` : score });
    } else if (name === 'clk' && /^\d+:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
      annotations.push({ label: 'Clock', value: raw });
    } else {
      annotations.push({ label: name, value: raw });
    }
    return ' ';
  }).replace(/[^\S\n]+/g, ' ').trim();
  return { text, annotations };
}

export function chessMoveLabel(move) {
  return move ? `${move.before.split(' ')[5]}${move.color === 'b' ? '…' : '.'} ${move.san}` : 'Starting position';
}
