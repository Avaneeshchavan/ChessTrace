import { useEffect, useSyncExternalStore } from 'react';
import { serviceHealth } from '../config/serviceRequest';

export function useServiceHealth(url) {
  const service = serviceHealth(url);
  const status = useSyncExternalStore(service.subscribe, service.snapshot);
  useEffect(() => { service.check().catch(() => {}); }, [service]);
  return { status, retry: () => service.check(true).catch(() => {}) };
}
