import { useState, useEffect } from 'react';

export function useServiceHealth(url) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'awake' | 'waking' | 'error'

  useEffect(() => {
    let mounted = true;
    let timeoutId;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const RETRY_INTERVAL = 4000;

    const checkHealth = async (isRetry = false) => {
      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${url}/health`, {
          signal: controller.signal
        });
        clearTimeout(fetchTimeout);

        if (res.ok) {
          if (mounted) setStatus('awake');
          return;
        } else {
          throw new Error('Service returned non-ok status');
        }
      } catch (err) {
        if (!mounted) return;

        if (retryCount >= MAX_RETRIES) {
          setStatus('error');
          return;
        }

        setStatus('waking');
        retryCount++;
        timeoutId = setTimeout(() => checkHealth(true), RETRY_INTERVAL);
      }
    };

    checkHealth();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [url]);

  return { status };
}
