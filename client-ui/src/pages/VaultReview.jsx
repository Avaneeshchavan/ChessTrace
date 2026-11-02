import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Board } from '../components/Board/Board';
import { useAuth } from '../context/AuthContext';
import { Chess } from 'chess.js';

import { API_BASE_URL } from '../config/api';

export default function VaultReview() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchQueue() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/vault/review-queue`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch review queue');
        const data = await res.json();
        if (isMounted) {
          setQueue(data.queue || []);
          setIsLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setIsLoading(false);
      }
    }
    if (token) fetchQueue();
    return () => { isMounted = false; };
  }, [token]);

  const handleRate = async (quality) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const puzzle = queue[currentIndex];
    try {
      await fetch(`${API_BASE_URL}/api/vault/${puzzle.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ quality })
      });
      
      // Advance to next
      setIsRevealed(false);
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to submit rating', err);
      alert('Failed to save rating.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 h-[calc(100vh-64px)]">
        <Loader2 size={48} className="text-[#3b759e] animate-spin" />
      </div>
    );
  }

  // All caught up state
  if (currentIndex >= queue.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] p-8 max-w-lg mx-auto text-center space-y-6">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
          <CheckCircle2 size={48} />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">You're all caught up!</h2>
          <p className="text-slate-500">0 puzzles due for review right now.</p>
        </div>
        <Link to="/vault" className="inline-flex items-center justify-center gap-2 bg-[#3b759e] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#2c5a7a] transition-colors w-full">
          <ArrowLeft size={18} /> Back to Vault
        </Link>
      </div>
    );
  }

  const puzzle = queue[currentIndex];
  const tags = puzzle.tags || [];
  
  // Calculate fen after reveal if there is a solutionPgn
  let displayFen = puzzle.fen;
  if (isRevealed && puzzle.solutionPgn) {
    // Basic support: If solution is a move sequence, we play the first move.
    // For a robust implementation, we might want to let the user play it out or animate.
    // Here we'll just show the final position of the solution PGN if possible.
    try {
      const c = new Chess(puzzle.fen);
      const tempC = new Chess();
      tempC.loadPgn(puzzle.solutionPgn);
      const history = tempC.history();
      history.forEach(move => c.move(move));
      displayFen = c.fen();
    } catch (e) {
      console.error('Failed to parse solution PGN', e);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center justify-between mb-8">
        <Link to="/vault" className="text-slate-500 hover:text-slate-900 flex items-center gap-2">
          <ArrowLeft size={18} /> Back
        </Link>
        <div className="text-sm font-medium text-slate-400">
          Review {currentIndex + 1} of {queue.length}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1">
        
        {/* The Board */}
        <div className="w-full max-w-[480px] aspect-square rounded-xl overflow-hidden shadow-xl ring-1 ring-slate-900/10 mb-6 bg-slate-200">
          <Board fen={displayFen} interactive={false} />
        </div>

        {/* Hints / Tags */}
        <div className="flex flex-wrap gap-2 justify-center mb-8 h-8">
          {tags.map(t => (
            <span key={t.id} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold tracking-wide uppercase">
              {t.name}
            </span>
          ))}
        </div>

        {/* Controls */}
        <div className="w-full max-w-[480px]">
          {!isRevealed ? (
            <button 
              onClick={() => setIsRevealed(true)}
              className="w-full bg-[#3b759e] hover:bg-[#2c5a7a] text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-sm"
            >
              Reveal Answer
            </button>
          ) : (
            <div className="flex flex-col gap-4">
              {puzzle.solutionPgn && (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center">
                  <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider block mb-1">Solution</span>
                  <span className="text-lg font-bold text-slate-900">{puzzle.solutionPgn}</span>
                </div>
              )}
              
              <div className="text-center text-sm font-medium text-slate-500 mb-2">How difficult was this?</div>
              
              <div className="grid grid-cols-4 gap-2">
                <button 
                  disabled={isSubmitting}
                  onClick={() => handleRate(1)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Again
                </button>
                <button 
                  disabled={isSubmitting}
                  onClick={() => handleRate(3)}
                  className="bg-[#c7d5e0] hover:bg-[#a6bfd1] text-[#2c5a7a] py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Hard
                </button>
                <button 
                  disabled={isSubmitting}
                  onClick={() => handleRate(4)}
                  className="bg-[#598096] hover:bg-[#4a6b7d] text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Good
                </button>
                <button 
                  disabled={isSubmitting}
                  onClick={() => handleRate(5)}
                  className="bg-[#3b759e] hover:bg-[#2c5a7a] text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Easy
                </button>
              </div>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
