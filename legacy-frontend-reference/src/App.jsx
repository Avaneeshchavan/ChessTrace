import { useCallback, useState } from 'react';
import { Board } from './components/Board/Board.jsx';
import { UploadZone } from './components/UploadZone/UploadZone.jsx';
import { SearchPanel } from './components/SearchPanel/SearchPanel.jsx';
import { SandboxControls } from './components/SandboxControls/SandboxControls.jsx';
import { EvalBar } from './components/EnginePanel/EvalBar.jsx';
import { useVisionParse } from './hooks/useVisionParse.js';
import { useStockfish } from './hooks/useStockfish.js';
import { useDatabaseSearch } from './hooks/useDatabaseSearch.js';
import {
  STARTING_FEN,
  toFenCore,
  placementToFullFen,
  flipSideToMove,
} from './lib/fen.js';
import { Castle } from 'lucide-react';

export default function App() {
  const [fen, setFen] = useState(STARTING_FEN);
  const [orientation, setOrientation] = useState('white');
  const [lowConfidenceSquares, setLowConfidenceSquares] = useState([]);

  const vision = useVisionParse();
  const stockfish = useStockfish();
  const search = useDatabaseSearch();

  const activeColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';

  const handleFile = useCallback(
    async (file) => {
      const data = await vision.parseScreenshot(file);
      if (!data) return;
      setLowConfidenceSquares(data.low_confidence_squares || []);
      if (data.fen_valid) {
        const nextFen = placementToFullFen(data.piece_placement_field, {
          active: data.best_effort_fields?.active_color,
          castling: data.best_effort_fields?.castling_availability,
        });
        setFen(nextFen);
        stockfish.evaluatePosition(nextFen);
      }
    },
    [vision, stockfish]
  );

  const handleMove = useCallback(
    (_orig, _dest, placement) => {
      if (!placement) return;
      // Preserve castling rights from the current FEN; toggle side to move.
      const parts = fen.split(' ');
      const nextActive = parts[1] === 'w' ? 'b' : 'w';
      const castling = parts[2] || '-';
      const nextFen = `${placement} ${nextActive} ${castling} - 0 1`;
      setFen(nextFen);
      stockfish.evaluatePosition(nextFen);
    },
    [fen, stockfish]
  );

  const handleSetFen = useCallback(
    (nextFen) => {
      setFen(nextFen);
      stockfish.evaluatePosition(nextFen);
    },
    [stockfish]
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] font-sans text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 min-h-screen p-4 flex flex-col justify-between">
        <div>
          <div className="flex shrink-0 items-center gap-3 py-4 mb-6 border-b border-slate-200">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3b82f6] text-white shadow-sm">
              <Castle size={20} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <h1 className="text-xl font-black tracking-[-0.05em] text-[#3b82f6]">ChessTrace</h1>
          </div>
          <nav className="flex flex-col gap-2">
            <a href="#" className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">Origin Lens</a>
            <a href="#" className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-md transition-colors">Blueprint Sandbox</a>
            <a href="#" className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">History</a>
            <a href="#" className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">Settings</a>
          </nav>
        </div>
      </aside>

      {/* Center Workspace */}
      <section className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto min-h-screen">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col items-center gap-6 w-fit">
          <div className="shrink-0 flex flex-row items-center justify-center gap-4">
            <div className="h-[600px] flex items-center">
              <span className="sr-only">Evaluation bar</span>
              <EvalBar evaluation={stockfish.evaluation} orientation={orientation} />
            </div>
            <Board
              fen={fen}
              orientation={orientation}
              turnColor={activeColor}
              onMove={handleMove}
              lowConfidenceSquares={lowConfidenceSquares}
            />
          </div>
          <div className="w-full">
            <SandboxControls
              fen={fen}
              orientation={orientation}
              onFlipOrientation={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              onToggleSideToMove={() => handleSetFen(flipSideToMove(fen))}
              onSetFen={handleSetFen}
              depth={stockfish.depth}
              onSetDepth={stockfish.setDepth}
            />
          </div>
        </div>
      </section>

      {/* Right Column */}
      <aside className="w-80 shrink-0 p-4 lg:p-6 lg:pl-0 flex flex-col">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col h-full gap-4">
          <div className="shrink-0">
            <UploadZone
              status={vision.status}
              error={vision.error}
              result={vision.result}
              onFile={handleFile}
            />
          </div>
          <hr className="border-slate-200" />
          <div className="flex-1 overflow-y-auto">
            <SearchPanel
              status={search.status}
              error={search.error}
              exactMatches={search.exactMatches}
              similarMatches={search.similarMatches}
              onSearch={() => search.search(toFenCore(fen))}
              onPreviewFen={setFen}
            />
          </div>
        </div>
      </aside>
    </main>
  );
}
