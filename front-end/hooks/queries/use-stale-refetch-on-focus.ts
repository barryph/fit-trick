import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Refetches a query when its screen regains focus, but only when the cached
 * data is already stale. Fresh data is served from the cache without a
 * network request.
 *
 * Tab switches do not trigger React Query's `refetchOnWindowFocus` (that only
 * fires on app/window focus), so a mounted tab can otherwise sit on stale
 * data until a mutation invalidates it. This hook closes that gap while
 * keeping requests minimal.
 *
 * The query key is read from a ref so the focus effect stays stable across
 * renders (avoiding refetch loops from recreated key arrays) while always
 * using the latest key (e.g. a `today` that changed).
 */
export function useStaleRefetchOnFocus(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  useFocusEffect(
    useCallback(() => {
      const query = queryClient.getQueryCache().find({
        queryKey: queryKeyRef.current,
      });
      if (query && query.isStale()) {
        void queryClient.invalidateQueries({
          queryKey: queryKeyRef.current,
        });
      }
    }, [queryClient]),
  );
}
