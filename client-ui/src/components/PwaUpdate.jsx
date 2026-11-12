import { useEffect, useState } from 'react';

export function PwaUpdate() {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let registration;
    let installing;
    let active = true;
    let idleId;
    let timeoutId;
    const inspect = () => {
      if (active && navigator.serviceWorker.controller && registration?.waiting) setWaiting(registration.waiting);
    };
    const onUpdate = () => {
      installing?.removeEventListener('statechange', inspect);
      installing = registration.installing;
      installing?.addEventListener('statechange', inspect);
    };
    const register = async () => {
      try {
        const result = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        if (!active) return;
        registration = result;
        registration.addEventListener('updatefound', onUpdate);
        onUpdate();
        inspect();
      } catch (error) {
        console.warn('Could not enable offline ChessTrace', error);
      }
    };
    const start = () => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(register, { timeout: 2_500 });
      else timeoutId = setTimeout(register, 0);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    return () => {
      active = false;
      window.removeEventListener('load', start);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      clearTimeout(timeoutId);
      registration?.removeEventListener('updatefound', onUpdate);
      installing?.removeEventListener('statechange', inspect);
    };
  }, []);

  function update() {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    setWaiting(null);
  }

  if (!waiting) return null;
  return (
    <aside className="ct-update" aria-label="App update">
      <p role="status">A ChessTrace update is ready.</p>
      <button type="button" className="ct-button" onClick={update}>Reload app</button>
      <button type="button" className="ct-quiet" onClick={() => setWaiting(null)}>Later</button>
    </aside>
  );
}
