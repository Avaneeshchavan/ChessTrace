import { useServiceHealth } from '../hooks/useServiceHealth';

export default function ServiceHealthBanner({ url, label = 'server' }) {
  const { status, retry } = useServiceHealth(url);
  if (status === 'awake') return null;
  return (
    <div className="study-health flex flex-wrap items-center justify-between gap-2">
      <span role="status">
        {status === 'error' ? `The last connection to the ${label} failed.` : `Checking the connection to the ${label}…`}
      </span>
      {status === 'error' && <button type="button" className="underline" onClick={retry}>Retry</button>}
    </div>
  );
}
