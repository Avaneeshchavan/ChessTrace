import ServiceHealthBanner from '../components/ServiceHealthBanner';
import { API_BASE_URL } from '../config/api';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ChessTraceLogo from '../components/ChessTraceLogo';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { validatePassword } from '../utils/validation';

export default function Auth() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isLogin = searchParams.get('mode') !== 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        const { valid, message } = validatePassword(password);
        if (!valid) {
          setError(message);
          setLoading(false);
          return;
        }
        await register(email, password, displayName);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
          <p className="mt-5 text-sm text-slate-500">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        <ServiceHealthBanner url={API_BASE_URL} />

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-slate-700">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="Grandmaster"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--ct-accent)] focus:ring-2 focus:ring-[var(--ct-accent)]"
                required
              />
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--ct-accent)] focus:ring-2 focus:ring-[var(--ct-accent)]"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
            </div>
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--ct-accent)] focus:ring-2 focus:ring-[var(--ct-accent)]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ct-button w-full"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button"
            onClick={() => { setSearchParams(isLogin ? { mode: 'register' } : {}); setError(''); }}
            className="font-medium text-slate-600 transition hover:text-[var(--ct-accent)]"
          >
            {isLogin ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </section>
    </main>
  );
}
