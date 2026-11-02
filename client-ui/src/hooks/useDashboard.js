import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useServiceHealth } from './useServiceHealth';

export function useDashboard() {
  const { token, logout } = useAuth();
  const { status } = useServiceHealth(API_BASE_URL);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboard() {
      if (!token) return;
      if (status !== 'awake') {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/summary`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.status === 401) {
          logout();
          throw new Error('Session expired');
        }
        if (!res.ok) throw new Error('Failed to fetch dashboard data');
        const json = await res.json();
        if (isMounted) {
          setData(json);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchDashboard();

    return () => { isMounted = false; };
  }, [token, status]);

  const logActivity = async (type, metadata = {}) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/api/dashboard/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type, metadata })
      });
      // Optionally could refresh data here, but fire-and-forget is fine for now
    } catch (err) {
      console.error('Failed to log activity', err);
    }
  };

  return { data, isLoading, error, status, logActivity };
}
