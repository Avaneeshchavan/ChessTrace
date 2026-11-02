import { FaChessKnight } from 'react-icons/fa6';

export default function ChessTraceLogo() {
  return (
    <div className="flex items-center gap-1.5 select-none">
      {/* The vector icon: perfectly sized to match the font height, colored in our harmonized marine blue */}
      <FaChessKnight className="text-3xl text-[#3b759e]" />
      
      {/* The Wordmark: tightly tracked, crisp typography */}
      <span className="text-2xl font-extrabold tracking-tighter mt-1">
        <span className="text-slate-900">Chess</span>
        <span className="text-[#3b759e]">Trace</span>
      </span>
    </div>
  );
}
