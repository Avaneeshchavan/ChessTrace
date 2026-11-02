import { useCallback, useState } from 'react';

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3000';

/**
 * Fires both /api/search/exact and /api/search/similar (see
 * API_CONTRACT.md — these routes don't exist yet on the backend as of
 * this phase; this hook is written to that proposed contract).
 *
 * "similar has results, exact is empty" is modeled as a normal success
 * state, not an error, per EXPLANATION.md §1.
 */
export function useDatabaseSearch() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [exactMatches, setExactMatches] = useState([]);
  const [similarMatches, setSimilarMatches] = useState([]);
  const [error, setError] = useState(null);

  const search = useCallback(async (fenCore, { limit = 10 } = {}) => {
    setStatus('loading');
    setError(null);
    try {
      const exactUrl = `${BACKEND_API_URL}/api/search/exact?fenCore=${encodeURIComponent(fenCore)}`;
      const similarUrl = `${BACKEND_API_URL}/api/search/similar?fenCore=${encodeURIComponent(fenCore)}&limit=${limit}`;

      const [exactRes, similarRes] = await Promise.all([
        fetch(exactUrl),
        fetch(similarUrl),
      ]);

      if (!exactRes.ok || !similarRes.ok) {
        const failed = !exactRes.ok ? exactRes : similarRes;
        const body = await failed.json().catch(() => null);
        throw new Error(body?.error?.message || `Search failed (${failed.status})`);
      }

      const exactData = await exactRes.json();
      const similarData = await similarRes.json();

      setExactMatches(exactData.matches || []);
      setSimilarMatches(similarData.matches || []);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not reach the search service.');
    }
  }, []);

  const fetchGame = useCallback(async (gameId) => {
    const res = await fetch(`${BACKEND_API_URL}/api/games/${gameId}`);
    if (!res.ok) throw new Error(`Could not load game ${gameId}`);
    return res.json();
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setExactMatches([]);
    setSimilarMatches([]);
    setError(null);
  }, []);

  return { status, exactMatches, similarMatches, error, search, fetchGame, reset };
}
