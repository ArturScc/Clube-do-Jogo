'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const cache = new Map<string, unknown>();

export function useStaleQuery<T>(key: string, fetcher: () => Promise<T>, enabled = true) {
  const cached = cache.get(key) as T | undefined;
  const [data, setData] = useState<T | undefined>(cached);
  const [isInitialLoading, setIsInitialLoading] = useState(enabled && cached === undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const hasData = cache.has(key);
    setIsInitialLoading(!hasData);
    setIsRefreshing(hasData);
    try {
      const next = await fetcherRef.current();
      cache.set(key, next);
      setData(next);
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value : new Error('Não foi possível atualizar os dados.'));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [enabled, key]);

  const setQueryData = useCallback((next: T) => {
    cache.set(key, next);
    setData(next);
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const nextCached = cache.get(key) as T | undefined;
      setData(nextCached);
      void refresh();
    });
    return () => { cancelled = true; };
  }, [key, refresh]);

  return { data, isInitialLoading, isRefreshing, error, refresh, setData: setQueryData };
}
