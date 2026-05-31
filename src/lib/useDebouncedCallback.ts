import { useEffect, useMemo, useRef } from 'react';

/**
 * Returns a stable debounced wrapper around `fn`. Rapid calls (e.g. a burst of
 * Supabase Realtime events during a bulk sync) collapse into a single trailing
 * invocation after `ms` of quiet. The latest `fn` is always used.
 */
export function useDebouncedCallback(fn: () => void, ms = 400): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useMemo(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(), ms);
    },
    [ms],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return debounced;
}
