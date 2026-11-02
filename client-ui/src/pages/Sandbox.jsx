import { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board/Board';
import { EnginePanel } from '../components/EnginePanel/EnginePanel';
import { useStockfish } from '../hooks/useStockfish';

export default function Sandbox() {
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [isValid, setIsValid] = useState(true);

  const chessRef = useRef(new Chess());

  const engine = useStockfish();

  useEffect(() => {
    engine.evaluatePosition(fen);
  }, [fen]);

  const handleFenChange = (e) => {
    const newFen = e.target.value;
    setFen(newFen);
    try {
      chessRef.current.load(newFen);
      setIsValid(true);
    } catch {
      setIsValid(false);
    }
  };

  const handleMove = useCallback((orig, dest) => {
    try {
      const move = chessRef.current.move({ from: orig, to: dest, promotion: 'q' });
      if (move) {
        setFen(chessRef.current.fen());
        setIsValid(true);
      } else {
        setFen(chessRef.current.fen());
      }
    } catch (e) {
      setFen(chessRef.current.fen());
    }
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Blueprint Sandbox</h1>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Left: Board Area */}
        <div className="flex-1">
          {/* FEN Input */}
          <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium uppercase tracking-wider text-slate-400">FEN Position</label>
              <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md ${
                isValid
                  ? 'bg-[#3b759e]/10 ring-1 ring-[#3b759e]/30 text-[#3b759e]'
                  : 'bg-red-50 ring-1 ring-red-200 text-red-600'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isValid ? 'bg-[#3b759e]' : 'bg-red-500'}`} />
                {isValid ? 'Valid Position' : 'Invalid Position'}
              </div>
            </div>
            <input
              type="text"
              value={fen}
              onChange={handleFenChange}
              className="w-full px-3 py-2 text-xs bg-slate-50 ring-1 ring-slate-900/5 rounded-lg font-mono text-slate-700 outline-none transition focus:ring-2 focus:ring-[#3b759e]"
            />
          </div>

          {/* Board Mount */}
          <div
            id="board-mount"
            className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-4"
          >
            <Board fen={fen} onMove={handleMove} interactive={true} />
          </div>
        </div>

        {/* Right: Engine Panel */}
        <div className="w-full xl:w-80 flex flex-col gap-6">
          <EnginePanel
            ready={engine.ready}
            evaluation={engine.evaluation}
            bestLine={engine.bestLine}
            depth={engine.depth}
            setDepth={engine.setDepth}
            searchDepthReached={engine.searchDepthReached}
            orientation="white"
          />
        </div>
      </div>
    </div>
  );
}
