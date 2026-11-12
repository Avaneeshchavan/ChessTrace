import { fetchService } from '../config/serviceRequest';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Loader2, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Board } from '../components/Board/Board';
import { API_BASE_URL } from '../config/api';
import { MotifPicker } from '../components/Vault/MotifPicker';
import { useServiceHealth } from '../hooks/useServiceHealth';

function SolveRate({ weeks }) {
  const motifs = [...new Set(weeks.map(week => week.motif))].sort();
  const [filter, setFilter] = useState('');
  const motif = motifs.includes(filter) ? filter : motifs[0];
  const rows = weeks.filter(week => week.motif === motif);
  return (
    <section className="mb-6 space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">Reported solve rate by motif</h2>
      <p className="text-xs text-slate-600">Last 90 days, grouped by UTC week. Hard, Good and Easy count as solved.</p>
      {rows.length ? <>
        <label className="text-sm">Motif{' '}
          <select value={motif} onChange={event => setFilter(event.target.value)} className="rounded border p-1">
            {motifs.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        <ul className="space-y-2 text-xs" aria-label={`${motif} weekly solve rates`}>
          {rows.map(({ week, solved, attempts }) => (
            <li key={week} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
              <time dateTime={week}>{week}</time>
              <div className="h-3 overflow-hidden rounded bg-slate-100" aria-hidden="true">
                <div className="h-full bg-[var(--ct-accent)]" style={{ width: `${100 * solved / attempts}%` }} />
              </div>
              <span>{Math.round(100 * solved / attempts)}% ({solved}/{attempts})</span>
            </li>
          ))}
        </ul>
      </> : <p className="text-sm text-slate-500">Review a tagged puzzle to see your progress here.</p>}
    </section>
  );
}

export default function PatternVault() {
  const { token, logout } = useAuth();
  const [puzzles, setPuzzles] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [weeks, setWeeks] = useState([]);
  const [statsError, setStatsError] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tagError, setTagError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedMotif, setSelectedMotif] = useState('All');
  const { status } = useServiceHealth(API_BASE_URL);

  useEffect(() => {
    const fetchVault = async () => {
      if (status !== 'awake') return;
      try {
        const [vaultRes, reviewRes, statsRes] = await Promise.all([
          fetchService(API_BASE_URL, `/api/vault`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }),
          fetchService(API_BASE_URL, `/api/vault/review-queue`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetchService(API_BASE_URL, `/api/vault/review-stats`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null)
        ]);
        
        if (vaultRes.status === 401 || reviewRes.status === 401) {
          logout();
          throw new Error('Session expired');
        }

        if (!vaultRes.ok) throw new Error('Failed to fetch vault');
        const vaultData = await vaultRes.json();
        setPuzzles(vaultData.puzzles);
        if (statsRes?.ok) {
          setWeeks((await statsRes.json()).weeks);
          setStatsError('');
        } else {
          setStatsError('Could not load review history.');
        }

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

  async function saveTags() {
    setSaving(true);
    setTagError('');
    try {
      const response = await fetchService(API_BASE_URL, `/api/vault/${edit.id}/tags`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: edit.tags }),
      });
      if (!response.ok) throw new Error('Could not save motifs.');
      const { puzzle } = await response.json();
      setPuzzles(previous => previous.map(item => item.id === puzzle.id ? puzzle : item));
      setEdit(null);
    } catch (err) {
      setTagError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const motifs = ['All', ...new Set(puzzles.flatMap(puzzle => puzzle.tags.map(tag => tag.name)))];
  const filteredPuzzles = puzzles.filter(p => {
    if (selectedMotif === 'All') return true;
    return p.tags.some(t => t.name === selectedMotif);
  });

  return (
    <main className="p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Pattern Vault</h1>

      {/* Review Banner */}
      {reviewCount > 0 && (
        <div className="bg-[var(--ct-accent)]/10 border border-[var(--ct-accent)]/30 rounded-xl p-4 sm:p-6 mb-8 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Spaced Repetition Review</h2>
            <p className="text-slate-600 text-sm mt-1">You have {reviewCount} puzzle{reviewCount !== 1 ? 's' : ''} queued for review.</p>
          </div>
          <Link to="/vault/review" className="bg-[var(--ct-accent)] hover:bg-[var(--ct-accent-hover)] text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors">
            <Play size={18} fill="currentColor" /> Start Review
          </Link>
        </div>
      )}

      {statsError ? <p role="status" className="mb-4 text-sm text-red-700">{statsError}</p>
        : !loading && !error && <SolveRate weeks={weeks} />}

      {/* Filter Bar */}
      {!loading && !error && status === 'awake' && (
        <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-4 mb-8 flex gap-4 items-center">
          <Filter size={16} className="text-slate-400" />

          <select aria-label="Filter by motif"
            value={selectedMotif}
            onChange={(e) => setSelectedMotif(e.target.value)}
            className="px-3 py-2 text-sm ring-1 ring-slate-900/5 rounded-lg text-slate-900 bg-slate-50 hover:bg-white outline-none transition focus:ring-2 focus:ring-[var(--ct-accent)]"
          >
            {motifs.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {status === 'waking' || status === 'checking' ? (
        <div className="flex flex-col items-center justify-center h-64 text-[var(--ct-accent)]">
          <div className="animate-pulse font-medium">Waiting for servers to wake up...</div>
        </div>
      ) : status === 'error' ? (
        <p role="alert" className="text-sm text-red-700">The vault is temporarily unavailable. Reload to retry.</p>
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
                <Board fen={puzzle.fen} viewOnly interactive={false} orientation="white" />
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex flex-wrap gap-2 mb-3">
                  {puzzle.tags.map(tag => (
                    <span key={tag.id} className="bg-[var(--ct-accent)] text-white text-xs font-semibold px-2 py-1 rounded">
                      {tag.name}
                    </span>
                  ))}
                </div>
                {edit?.id === puzzle.id ? (
                  <div className="mb-3 space-y-2">
                    <MotifPicker value={edit.tags} disabled={saving} onChange={tags => setEdit({ id: puzzle.id, tags })} />
                    {tagError && <p role="alert" className="text-xs text-red-700">{tagError}</p>}
                    <button type="button" onClick={saveTags} disabled={saving} className="mr-3 text-sm underline">Save motifs</button>
                    <button type="button" onClick={() => setEdit(null)} disabled={saving} className="text-sm underline">Cancel</button>
                  </div>
                ) : <button type="button" disabled={saving} onClick={() => {
                  setTagError('');
                  setEdit({ id: puzzle.id, tags: puzzle.tags.map(tag => tag.name) });
                }} className="mb-3 self-start text-sm underline">Edit motifs</button>}
                <div className="mt-auto">
                  <div className="text-xs font-semibold px-2 py-1 rounded w-fit bg-[var(--ct-accent)] text-white mb-2">
                    {new Date(puzzle.nextReviewAt) <= new Date() ? 'Due now' : `Due ${new Date(puzzle.nextReviewAt).toLocaleDateString()}`}
                  </div>
                  <div className="text-xs text-slate-400">Added {new Date(puzzle.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
