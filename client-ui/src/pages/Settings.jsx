import { fetchService } from '../config/serviceRequest';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { validatePassword } from '../utils/validation';
import { Loader2 } from 'lucide-react';
import { useServiceHealth } from '../hooks/useServiceHealth';

export default function Settings() {
  const { token, user, updateUser, logout } = useAuth();
  const { status } = useServiceHealth(API_BASE_URL);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  // Section 2: Display Name
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);

  // Section 3: Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(''); // Generic error
  const [currentPasswordError, setCurrentPasswordError] = useState(''); // Specific 401
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchSummary() {
      if (status !== 'awake') return;
      try {
        const res = await fetchService(API_BASE_URL, `/api/users/me/summary`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (res.status === 401) {
          logout();
          throw new Error('Session expired');
        }
        if (!res.ok) throw new Error('Failed to load account summary');
        const data = await res.json();
        if (mounted) {
          setSummary(data);
          setSummaryError('');
        }
      } catch (err) {
        if (mounted) setSummaryError(err.message);
      } finally {
        if (mounted) setLoadingSummary(false);
      }
    }
    if (token) fetchSummary();
    return () => { mounted = false; };
  }, [token, status]);

  // Derive initial value for displayName to check if it changed
  const originalName = user?.displayName || '';
  const isNameChanged = displayName.trim() !== originalName && displayName.trim().length > 0;

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    if (!isNameChanged) return;
    
    setNameError('');
    setNameSuccess(false);
    setSavingName(true);

    try {
      const res = await fetchService(API_BASE_URL, `/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ displayName })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update name');
      }

      const updatedUser = await res.json();
      updateUser({ displayName: updatedUser.displayName });
      
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2000);
    } catch (err) {
      setNameError(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setCurrentPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    const { valid, message } = validatePassword(newPassword);
    if (!valid) {
      setPasswordError(message);
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetchService(API_BASE_URL, `/api/users/me/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          setCurrentPasswordError(err.error);
        } else {
          throw new Error(err.error || 'Failed to update password');
        }
        setSavingPassword(false);
        return;
      }

      // Success
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Helper to get fallback name
  const displayFallback = user?.displayName || user?.email.split('@')[0];

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

        {/* SECTION 1: Account Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6 ring-1 ring-slate-900/5">
          {status === 'waking' || status === 'checking' ? (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--ct-accent)]">
              <div className="animate-pulse font-medium">Waiting for servers to wake up...</div>
            </div>
          ) : loadingSummary ? (
            <div className="flex justify-center p-4">
              <Loader2 size={24} className="text-[var(--ct-accent)] animate-spin" />
            </div>
          ) : summaryError ? (
            <div className="text-red-500 text-sm">{summaryError}</div>
          ) : summary ? (
            <div>
              <h2 className="text-xl font-bold text-slate-900">{summary.displayName || summary.email.split('@')[0]}</h2>
              <p className="text-slate-500 text-sm mb-4">{summary.email}</p>
              
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span className="font-medium bg-slate-100 px-3 py-1 rounded-md">
                  Member since {new Date(summary.memberSince).toLocaleDateString()}
                </span>
                <span className="font-medium bg-slate-100 px-3 py-1 rounded-md">
                  {summary.totalPuzzlesSaved} puzzles saved
                </span>
                <span className="font-medium bg-slate-100 px-3 py-1 rounded-md">
                  {summary.currentStreakDays} day streak
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* SECTION 2: Display Name */}
        <div className="bg-white rounded-xl shadow-sm p-6 ring-1 ring-slate-900/5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Profile Information</h3>
          
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 mb-1">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--ct-accent)] focus:ring-1 focus:ring-[var(--ct-accent)]"
              />
              {nameError && (
                <p className="mt-2 text-sm text-red-600">{nameError}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={!isNameChanged || savingName}
                className="h-10 px-4 rounded-lg bg-[var(--ct-accent)] text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ct-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ct-accent)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
              >
                {savingName ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
              </button>
              {nameSuccess && (
                <span className="text-sm font-medium text-green-600">Saved</span>
              )}
            </div>
          </form>
        </div>

        {/* SECTION 3: Security */}
        <div className="bg-white rounded-xl shadow-sm p-6 ring-1 ring-slate-900/5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Security</h3>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-1 ${currentPasswordError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200 focus:border-[var(--ct-accent)] focus:ring-[var(--ct-accent)]'}`}
              />
              {currentPasswordError && (
                <p className="mt-1 text-sm text-red-600">{currentPasswordError}</p>
              )}
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--ct-accent)] focus:ring-1 focus:ring-[var(--ct-accent)]"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--ct-accent)] focus:ring-1 focus:ring-[var(--ct-accent)]"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="h-10 px-4 rounded-lg bg-[var(--ct-accent)] text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ct-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ct-accent)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
              >
                {savingPassword ? <Loader2 size={16} className="animate-spin" /> : 'Update Password'}
              </button>
              {passwordSuccess && (
                <span className="text-sm font-medium text-green-600">Password updated</span>
              )}
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
