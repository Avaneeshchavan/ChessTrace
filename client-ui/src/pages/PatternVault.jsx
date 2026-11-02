import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Loader2, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Board } from '../components/Board/Board';
import { API_BASE_URL } from '../config/api';
import { useServiceHealth } from '../hooks/useServiceHealth';

const motifs = ['All', 'Pin', 'Fork', 'Skewer', 'Sacrifice', 'Blunder'];

export default function PatternVault() {
  const { token, logout } = useAuth();
  const [puzzles, setPuzzles] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedMotif, setSelectedMotif] = useState('All');
  const { status } = useServiceHealth(API_BASE_URL);

  useEffect(() => {
    const fetchVault = async () => {
      if (status !== 'awake') return;
      try {
        const [vaultRes, reviewRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vault`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }),
          fetch(`${API_BASE_URL}/api/vault/review-queue`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } })
        ]);
        
        if (vaultRes.status === 401 || reviewRes.status === 401) {
          logout();
          throw new Error('Session expired');
        }

        if (!vaultRes.ok) throw new Error('Failed to fetch vault');
        const vaultData = await vaultRes.json();
        setPuzzles(vaultData.puzzles);

        if (reviewRes.ok) {
          const reviewData = await reviewRes.json();
          setReviewCount(reviewData.queue ? reviewData.queue.length : 0);
        }

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (token) {
      fetchVault();
    }
  }, [token, status]);

  const filteredPuzzles = puzzles.filter(p => {
    if (selectedMotif === 'All') return true;
    return p.tags.some(t => t.name === selectedMotif);
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Pattern Vault</h1>

      {/* Review Banner */}
      {reviewCount > 0 && (
        <div className="bg-[#3b759e]/10 border border-[#3b759e]/30 rounded-xl p-6 mb-8 flex items-center justify-between shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Spaced Repetition Review</h2>
            <p className="text-slate-600 text-sm mt-1">You have {reviewCount} puzzle{reviewCount !== 1 ? 's' : ''} due for review today.</p>
          </div>
          <Link to="/vault/review" className="bg-[#3b759e] hover:bg-[#2c5a7a] text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors">
            <Play size={18} fill="currentColor" /> Start Review
          </Link>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-4 mb-8 flex gap-4 items-center">
        <Filter size={16} className="text-slate-400" />

        <select 
          value={selectedMotif}
          onChange={(e) => setSelectedMotif(e.target.value)}
          className="px-3 py-2 text-sm ring-1 ring-slate-900/5 rounded-lg text-slate-900 bg-slate-50 hover:bg-white outline-none transition focus:ring-2 focus:ring-[#3b759e]"
        >
          {motifs.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      {status === 'waking' || status === 'checking' ? (
        <div className="flex flex-col items-center justify-center h-64 text-[#3b759e]">
          <div className="animate-pulse font-medium">Waiting for servers to wake up...</div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading your vault...
        </div>
      ) : error ? (
        <div className="text-red-500 text-sm">{error}</div>
      ) : filteredPuzzles.length === 0 ? (
        <div className="text-slate-500 text-sm">No puzzles found. Analyze a game in Turning Points and save some blunders!</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredPuzzles.map((puzzle) => (
            <div key={puzzle.id} className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 overflow-hidden hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-shadow flex flex-col">
              <div className="w-full aspect-square overflow-hidden">
                <Board fen={puzzle.fen} viewOnly orientation="white" />
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex flex-wrap gap-2 mb-3">
                  {puzzle.tags.map(tag => (
                    <span key={tag.id} className="bg-[#7B4B2A] text-white text-xs font-semibold px-2 py-1 rounded">
                      {tag.name}
                    </span>
                  ))}
                </div>
                <div className="mt-auto">
                  <div className="text-xs font-semibold px-2 py-1 rounded w-fit bg-[#3b759e] text-white mb-2">
                    {puzzle.reviewStatus === 'DUE_TODAY' ? 'Due Today' : puzzle.reviewStatus === 'LEARNING' ? 'Learning' : 'Mastered'}
                  </div>
                  <div className="text-[10px] text-slate-400">Added {new Date(puzzle.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
