import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Play } from 'lucide-react';
import ChessTraceLogo from '../components/ChessTraceLogo';
import { API_BASE_URL } from '../config/api';
import { ServiceRequestInterruptedError, ServiceUnavailableError } from '../config/serviceRequest';
import { useAuth } from '../context/AuthContext';
import { useServiceHealth } from '../hooks/useServiceHealth';
import { validatePassword } from '../utils/validation';
import '../auth.css';

export default function Auth() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { login, register } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, retry } = useServiceHealth(API_BASE_URL);
  const isLogin = searchParams.get('mode') !== 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const connecting = status === 'waking' || status === 'checking';
  const showConnectionError = status === 'error' && !error;
  const showConnecting = !error && (status === 'waking' || (loading && connecting));

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (!isLogin) {
      const { valid, message } = validatePassword(password);
      if (!valid) {
        setError(message);
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(email.trim(), password, displayName.trim());
      const destination = ['/sandbox', '/vault'].includes(state?.returnTo) ? state.returnTo : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ServiceRequestInterruptedError) {
        setError(isLogin
          ? 'Sign-in was interrupted. Try again in a moment.'
          : 'Signup was interrupted. Try signing in with the same details before submitting again.');
      } else if (!(err instanceof ServiceUnavailableError)) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setSearchParams(isLogin ? { mode: 'register' } : {}, { state, replace: true });
    setError('');
    setShowPassword(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <header className="auth-header">
          <Link to="/" aria-label="ChessTrace home"><ChessTraceLogo /></Link>
          <Link to="/" className="auth-home"><ArrowLeft size={15} aria-hidden="true" /> Home</Link>
        </header>

        <div className="auth-grid">
          <aside className="auth-aside">
            <div className="auth-illustration" aria-hidden="true">
              <span>♞</span>
            </div>
            <div>
              <h2 className="ct-display">Bring a position.<br />Find its story.</h2>
              <p>Trace a screenshot back to games, replay the moves, and save positions to study again.</p>
            </div>
          </aside>

          <section className="auth-panel" aria-labelledby="auth-title">
            <div className="auth-modes" role="group" aria-label="Account options">
              <button type="button" aria-pressed={isLogin} disabled={loading} onClick={() => !isLogin && switchMode()}>Sign in</button>
              <button type="button" aria-pressed={!isLogin} disabled={loading} onClick={() => isLogin && switchMode()}>Create account</button>
            </div>
            <h1 id="auth-title" className="ct-display">{isLogin ? 'Welcome back.' : 'Create your account.'}</h1>
            <p className="auth-description">{isLogin ? 'Sign in to continue studying.' : 'Save positions and keep track of your practice.'}</p>

            {showConnecting && (
              <div className="auth-status" role="status">
                <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                <div><strong>Connecting to ChessTrace</strong><p>The server may take about a minute to wake up.</p></div>
              </div>
            )}
            {showConnectionError && (
              <div className="auth-status auth-status-error">
                <div role="status"><strong>Couldn’t reach the server</strong><p>Your entries are still here. Reconnect and try again.</p></div>
                <button type="button" onClick={retry}>Retry connection</button>
              </div>
            )}
            {error && <p className="auth-status auth-status-error" role="alert">{error}</p>}

            <form className="auth-form" onSubmit={handleSubmit}>
              {!isLogin && (
                <label htmlFor="name">
                  Display name
                  <input id="name" type="text" autoComplete="nickname" placeholder="Your name" value={displayName}
                    onChange={event => setDisplayName(event.target.value)} required />
                </label>
              )}
              <label htmlFor="email">
                Email
                <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email}
                  onChange={event => setEmail(event.target.value)} required />
              </label>
              <div>
                <label htmlFor="password">Password</label>
                <div className="auth-password">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)}
                    aria-describedby={isLogin ? undefined : 'password-hint'} required />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
                {!isLogin && <p id="password-hint">Use at least 6 characters.</p>}
              </div>
              <button type="submit" disabled={loading} className="ct-button auth-submit">
                {loading ? (connecting ? 'Connecting…' : isLogin ? 'Signing in…' : 'Creating account…') : isLogin ? 'Sign in' : 'Sign up'}
                {loading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
              </button>
            </form>
            <Link className="auth-sample" to="/#sample-game"><Play size={15} aria-hidden="true" /> Try the sample replay without an account</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
