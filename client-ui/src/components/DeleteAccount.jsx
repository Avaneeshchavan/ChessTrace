import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchService } from '../config/serviceRequest';
import { API_BASE_URL } from '../config/api';

export function DeleteAccount({ token, logout }) {
  const dialog = useRef(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      const response = await fetchService(API_BASE_URL, '/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      }, { timeoutMs: 15_000 });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status !== 404 || result.code !== 'ACCOUNT_NOT_FOUND') {
          throw new Error(result.error || 'Could not delete the account.');
        }
      }
      sessionStorage.setItem('chesstrace-account-deleted', '1');
      logout();
      navigate('/auth', { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setPassword('');
      setPending(false);
    }
  }

  return (
    <section className="ct-panel space-y-3 p-5" aria-labelledby="delete-account-heading">
      <h2 className="text-lg font-semibold" id="delete-account-heading">Delete your ChessTrace account</h2>
      <p className="text-sm text-slate-500">Permanently remove your saved puzzles, review history, and activity.</p>
      <button type="button" className="ct-quiet text-red-700" onClick={() => dialog.current.showModal()}>Delete account</button>
      <dialog ref={dialog} className="account-delete-dialog" aria-labelledby="delete-confirm-heading"
        onCancel={event => { if (pending) event.preventDefault(); }}
        onClose={() => { setPassword(''); setError(''); }}>
        <form className="space-y-4" onSubmit={submit}>
          <h2 className="text-xl font-semibold" id="delete-confirm-heading">Confirm account deletion</h2>
          <p className="text-sm text-slate-500" id="delete-confirm-description">Enter your current password to permanently delete your account.</p>
          <label className="block text-sm">Current password
            <input className="mt-1 block w-full rounded border border-slate-300 p-2" type="password" required
              aria-describedby="delete-confirm-description" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} disabled={pending} />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ct-quiet" onClick={() => dialog.current.close()} disabled={pending}>Cancel</button>
            <button type="submit" className="ct-danger-button" disabled={pending || !password}>
              {pending ? 'Deleting…' : 'Permanently delete account'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
