import { FaChessKnight } from 'react-icons/fa6';

export default function ChessTraceLogo() {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <FaChessKnight size={24} className="text-accent" aria-hidden="true" />
      <span className="ct-display text-3xl leading-none">ChessTrace</span>
    </span>
  );
}
