import { API_BASE_URL } from '../config/api';
import { fetchService } from '../config/serviceRequest';

export async function importGame({ input, username, month, fallback, signal }) {
  let pgn = input.trim();
  if (!pgn || /^https?:\/\//i.test(pgn)) {
    const url = pgn || fallback;
    if (!url) throw new Error('Paste a game link or PGN.');
    const response = await fetchService(API_BASE_URL, '/api/games/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, username: username.trim(), month }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not import the game.');
    pgn = data.pgn;
  }
  if (pgn.length > 100_000) throw new Error('Use a single PGN game under 100,000 characters.');
  return pgn;
}
