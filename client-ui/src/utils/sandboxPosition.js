import { Chess, validateFen } from 'chess.js';

const castleHomes = {
  K: ['e1', 'h1', 'w'], Q: ['e1', 'a1', 'w'],
  k: ['e8', 'h8', 'b'], q: ['e8', 'a8', 'b'],
};

export function inspectSandboxFen(input) {
  if (input.length > 200) return { error: 'The FEN is too long.', engineFen: null };
  const fen = input.trim().replace(/\s+/g, ' ');
  const fields = fen.split(' ');
  const validity = validateFen(fen);
  if (!validity.ok || fields.length !== 6 || !fields.slice(4).every(field => /^\d+$/.test(field) && Number(field) <= 1_000_000_000)) {
    return { error: validity.error || 'Enter all six FEN fields with numeric move counters.', engineFen: null };
  }
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter(Boolean);
  for (const color of ['w', 'b']) {
    const own = pieces.filter(piece => piece.color === color);
    const name = color === 'w' ? 'White' : 'Black';
    const pawns = own.filter(piece => piece.type === 'p').length;
    if (own.length > 16 || pawns > 8) return { chess, error: `${name} has too many pieces or pawns.`, engineFen: null };
    const extra = Object.entries({ n: 2, b: 2, r: 2, q: 1 }).reduce((count, [type, initial]) =>
      count + Math.max(0, own.filter(piece => piece.type === type).length - initial), 0);
    if (extra > 8 - pawns) return { chess, error: `${name} has more promoted pieces than missing pawns.`, engineFen: null };
  }

  const waitingKing = pieces.find(piece => piece.type === 'k' && piece.color !== chess.turn());
  if (chess.isAttacked(waitingKing.square, chess.turn())) {
    return { chess, error: 'The king of the side waiting to move is in check.', engineFen: null };
  }

  const rights = [...'KQkq'].filter(flag => {
    const [king, rook, color] = castleHomes[flag];
    return fields[2].includes(flag) && chess.get(king)?.type === 'k' && chess.get(king)?.color === color
      && chess.get(rook)?.type === 'r' && chess.get(rook)?.color === color;
  }).join('') || '-';
  const validRights = fields[2] === rights;
  const ep = fields[3];
  const pawnSquare = ep === '-' ? null : ep[0] + (chess.turn() === 'w' ? '5' : '4');
  const epPawn = pawnSquare && chess.get(pawnSquare);
  const validEp = ep === '-' || (!chess.get(ep) && epPawn?.type === 'p' && epPawn.color !== chess.turn());
  fields[2] = rights;
  if (!validEp) fields[3] = '-';
  const engineFen = fields.join(' ');
  const error = !validRights ? 'Castling rights do not match the board.' : !validEp ? 'The en passant target does not match a pawn on the board.' : '';
  return { chess, fen, error, engineFen };
}
