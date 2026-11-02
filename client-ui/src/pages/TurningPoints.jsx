import { useState, useRef, useEffect } from 'react';
import { Play, Loader2, BookmarkPlus, Check } from 'lucide-react';
import { Chess } from 'chess.js';
import { Board } from '../components/Board/Board';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { API_BASE_URL } from '../config/api';

export default function TurningPoints() {
  const { token } = useAuth();
  const { logActivity } = useDashboard();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [evaluations, setEvaluations] = useState([]); // absolute cp for white
  const [blunders, setBlunders] = useState([]);
  
  const [savingIndex, setSavingIndex] = useState(null);
  const [savedIndices, setSavedIndices] = useState([]);
  const [activeTagSelect, setActiveTagSelect] = useState(null);
  const [selectedTag, setSelectedTag] = useState('Pin');
  
  const handleSaveToVault = async (blunder) => {
    if (!token) {
      alert("Please log in to save puzzles.");
      return;
    }
    setSavingIndex(blunder.index);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vault`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fen: blunder.fenBefore,
          initialMove: blunder.san,
          tags: [selectedTag]
        })
      });
      if (!res.ok) throw new Error('Failed to save');
      setSavedIndices([...savedIndices, blunder.index]);
      setActiveTagSelect(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save to vault: ' + err.message);
    } finally {
      setSavingIndex(null);
    }
  };

  const analyzeGame = async () => {
    setIsLoading(true);
    setProgress(0);
    setEvaluations([]);
    setBlunders([]);

    try {
      let pgn = '';
      const trimmedUrl = url.trim();

      // If input looks like a URL, fetch from backend; otherwise treat as raw PGN
      if (trimmedUrl.startsWith('http')) {
        const targetUrl = trimmedUrl || 'https://lichess.org/diwRghmF';
        const res = await fetch(`${API_BASE_URL}/api/games/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });
        if (!res.ok) throw new Error('Failed to fetch PGN');
        const data = await res.json();
        pgn = data.pgn;
      } else if (trimmedUrl.length > 0) {
        // Raw PGN pasted directly
        pgn = trimmedUrl;
      } else {
        // Fallback to a known game
        const res = await fetch(`${API_BASE_URL}/api/games/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://lichess.org/diwRghmF' })
        });
        if (!res.ok) throw new Error('Failed to fetch PGN');
        const data = await res.json();
        pgn = data.pgn;
      }

      // Normalize Lichess castling notation: O-O → 0-0 (chess.js expects zeros)
      const normalizedPgn = pgn.replace(/O-O-O/g, '0-0-0').replace(/O-O/g, '0-0');
      const chess = new Chess();
      chess.loadPgn(normalizedPgn);
      const history = chess.history({ verbose: true });
      
      const evals = [];
      const blundersFound = [];
      const worker = new Worker('/stockfish/stockfish-worker.js');
      
      await new Promise(r => {
        worker.onmessage = e => {
          if (e.data === 'ct-worker-ready') worker.postMessage('uci');
          if (e.data === 'uciok') worker.postMessage('isready');
          if (e.data === 'readyok') r();
        };
      });

      const testChess = new Chess();
      let prevAbsScore = 0; // Start at 0.00

      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        // Pass .san string instead of verbose object for chess.js v1 compatibility
        testChess.move(move.san);
        
        worker.postMessage('stop');
        worker.postMessage(`position fen ${testChess.fen()}`);
        worker.postMessage(`go depth 10`);
        
        const score = await new Promise(r => {
          let lastScore = null;
          const handler = e => {
            const line = e.data;
            if (typeof line === 'string') {
              if (line.startsWith('info') && line.includes('score')) {
                const tokens = line.split(' ');
                const scoreIdx = tokens.indexOf('score');
                const type = tokens[scoreIdx + 1];
                const val = Number(tokens[scoreIdx + 2]);
                if (type === 'mate') lastScore = Math.sign(val) * 10000;
                if (type === 'cp') lastScore = val;
              }
              if (line.startsWith('bestmove')) {
                worker.removeEventListener('message', handler);
                r(lastScore);
              }
            }
          };
          worker.addEventListener('message', handler);
        });

        if (score !== null) {
          // Absolute score from white's perspective
          const absScore = testChess.turn() === 'w' ? score : -score;
          
          const playerWhoMoved = testChess.turn() === 'w' ? 'b' : 'w';
          const swing = absScore - prevAbsScore; 
          const playerSwing = playerWhoMoved === 'w' ? swing : -swing;
          
          if (playerSwing < -150) {
            const beforeChess = new Chess();
            beforeChess.loadPgn(normalizedPgn);
            for (let j = 0; j < i; j++) beforeChess.move(history[j].san);
            
            blundersFound.push({
              index: i,
              moveNumber: Math.floor(i / 2) + 1,
              color: playerWhoMoved,
              san: move.san,
              fenBefore: beforeChess.fen(),
              swing: playerSwing,
            });
          }
          prevAbsScore = absScore;
          evals.push(absScore);
        } else {
          evals.push(prevAbsScore);
        }
        
        setProgress(Math.round(((i + 1) / history.length) * 100));
      }
      
      worker.terminate();
      setEvaluations(evals);
      setBlunders(blundersFound);
      
      // Fire-and-forget log
      logActivity('TURNING_POINTS_RUN', { blundersFound: blundersFound.length });
    } catch (err) {
      console.error(err);
      alert('Failed to analyze game: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Turning Points</h1>

      <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-6 mb-8">
        <label className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Lichess URL or Paste PGN</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyzeGame()}
            placeholder="https://lichess.org/diwRghmF"
            className="flex-1 px-4 py-2 ring-1 ring-slate-900/5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:ring-2 focus:ring-[#3b759e]"
            disabled={isLoading}
          />
          <button 
            onClick={analyzeGame}
            disabled={isLoading}
            className="px-6 py-2 bg-[#3b759e] text-white rounded-lg font-semibold text-sm hover:bg-[#2c5a7a] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isLoading ? `Analyzing ${progress}%` : 'Analyze'}
          </button>
        </div>
      </div>

      {evaluations.length > 0 && (
        <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-6 mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">Evaluation Swing</h2>
          <div className="h-48 relative ring-1 ring-slate-900/5 rounded-lg bg-slate-50 flex items-end gap-0.5 px-4 py-4 overflow-hidden">
            {evaluations.map((score, i) => {
              // Normalize score (-500 to +500 cp fits in 0-100% height)
              let height = ((score + 500) / 1000) * 100;
              height = Math.max(5, Math.min(95, height));
              const isBlunder = blunders.some(b => b.index === i);
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-t transition-colors ${
                    isBlunder ? 'bg-red-500' : 'bg-[#3b759e]'
                  } hover:opacity-75 relative group cursor-pointer`}
                  style={{ height: `${height}%` }}
                >
                  <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    Move {Math.floor(i/2) + 1}{i%2===0?'.':'...'} {score > 0 ? '+' : ''}{(score/100).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span>Blunders detected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#3b759e] rounded" />
              <span>Position evaluation</span>
            </div>
          </div>
        </div>
      )}

      {blunders.length > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">Extracted Puzzles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blunders.map((blunder, i) => (
              <div key={i} className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 overflow-hidden flex flex-col">
                <div className="w-full aspect-square overflow-hidden">
                  <Board fen={blunder.fenBefore} viewOnly orientation="white" />
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900">
                      Move {blunder.moveNumber} ({blunder.color === 'w' ? 'White' : 'Black'})
                    </span>
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded">
                      {blunder.san} ??
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Eval dropped by {(-blunder.swing / 100).toFixed(2)} pawns
                  </p>
                  {savedIndices.includes(blunder.index) ? (
                    <div className="w-full mt-auto px-3 py-2 bg-slate-100 text-slate-500 flex justify-center items-center gap-2 text-xs font-semibold rounded-lg">
                      <Check size={16} /> Saved
                    </div>
                  ) : activeTagSelect === blunder.index ? (
                    <div className="mt-auto flex gap-2">
                      <select 
                        value={selectedTag} 
                        onChange={e => setSelectedTag(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs ring-1 ring-slate-900/5 rounded-lg text-slate-900 bg-slate-50 outline-none focus:ring-2 focus:ring-[#3b759e]"
                      >
                        <option>Pin</option>
                        <option>Fork</option>
                        <option>Skewer</option>
                        <option>Sacrifice</option>
                        <option>Blunder</option>
                      </select>
                      <button 
                        onClick={() => handleSaveToVault(blunder)}
                        disabled={savingIndex === blunder.index}
                        className="px-3 py-1.5 bg-[#3b759e] text-white text-xs font-semibold rounded-lg hover:bg-[#2c5a7a] flex items-center justify-center min-w-[60px] disabled:opacity-50"
                      >
                        {savingIndex === blunder.index ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setActiveTagSelect(blunder.index)}
                      className="w-full mt-auto px-3 py-2 bg-[#3b759e] text-white text-xs font-semibold rounded-lg hover:bg-[#2c5a7a] transition-colors flex items-center justify-center gap-2"
                    >
                      <BookmarkPlus size={16} />
                      Save to Vault
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
