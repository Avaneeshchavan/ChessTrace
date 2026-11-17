import { useServiceHealth } from '../hooks/useServiceHealth';

export default function ServiceHealthBanner({ url, label = 'server' }) {
  const { status, retry } = useServiceHealth(url);
  if (status === 'awake') return null;
  return (
    <div className="study-health flex flex-wrap items-center justify-between gap-2">
      <span role="status">
        {status === 'error' ? `The ${label} is still unavailable.` : `Waking up the ${label} (about 30–60 seconds)…`}
      </span>
      {status === 'error' && <button type="button" className="underline" onClick={retry}>Retry</button>}
    </div>
  );
}
