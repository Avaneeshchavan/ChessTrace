import { fetchService } from '../config/serviceRequest';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { PuzzlePlay } from '../components/Vault/PuzzlePlay';
import { useAuth } from '../context/AuthContext';

import { API_BASE_URL } from '../config/api';

export default function VaultReview() {
  const { token } = useAuth();

  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [toleranceCp, setToleranceCp] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchQueue() {
      try {
        const res = await fetchService(API_BASE_URL, `/api/vault/review-queue`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch review queue');
        const data = await res.json();
        if (isMounted) {
          setQueue(data.queue || []);
          setToleranceCp(data.toleranceCp ?? 50);
          setIsLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError('Could not load the review queue.');
          setIsLoading(false);
        }
      }
    }
    if (token) fetchQueue();
    return () => { isMounted = false; };
  }, [token]);

  const handleRate = async (quality) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    
    const puzzle = queue[currentIndex];
    try {
      const response = await fetchService(API_BASE_URL, `/api/vault/${puzzle.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ quality })
      });
      
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save rating.');

      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to submit rating', err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 min-h-[calc(100dvh-64px)]">
        <Loader2 size={48} className="text-[var(--ct-accent)] animate-spin" aria-hidden="true" />
        <p role="status" className="sr-only">Loading review queue…</p>
      </main>
    );
  }

  if (error && !queue.length) return <main className="p-8"><p role="alert">{error}</p><Link to="/vault" className="inline-flex min-h-11 items-center underline">Back to vault</Link></main>;

  // All caught up state
  if (currentIndex >= queue.length) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[calc(100dvh-64px)] p-8 max-w-lg mx-auto text-center space-y-6">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
          <CheckCircle2 size={48} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">You're all caught up!</h1>
          <p className="text-slate-500">0 puzzles due for review right now.</p>
        </div>
        <Link to="/vault" className="inline-flex items-center justify-center gap-2 bg-[var(--ct-accent)] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[var(--ct-accent-hover)] transition-colors w-full">
          <ArrowLeft size={18} /> Back to Vault
        </Link>
      </main>
    );
  }

  const puzzle = queue[currentIndex];
  return (
    <main className="ct-workspace">
      <header className="puzzle-review-header">
        <Link to="/vault" className="ct-quiet"><ArrowLeft size={18} aria-hidden="true" /> Vault</Link>
        <div>
          <h1>Play the turning point</h1>
          <p className="mt-2 text-sm text-slate-500">Review {currentIndex + 1} of {queue.length}</p>
        </div>
      </header>
      <PuzzlePlay key={puzzle.id} puzzle={puzzle} token={token} toleranceCp={toleranceCp}
        onRate={handleRate} rating={isSubmitting} ratingError={error} />
    </main>
  );
}
