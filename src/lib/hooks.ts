import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Viewport height that follows resize/rotation (so sheet and map insets do not go stale). */
export function useViewportHeight(): number {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('resize', notify);
      return () => window.removeEventListener('resize', notify);
    },
    () => window.innerHeight,
    () => 800,
  );
}
