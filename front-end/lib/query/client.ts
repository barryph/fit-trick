import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      // Send the request even when NetInfo reports no connection. The default
      // ('online') parks the query in `fetchStatus: 'paused'` with
      // `status: 'pending'`, which every screen renders as an endless loading
      // state: no error, no retry, and nothing for the user to act on.
      // Attempting the request instead fails fast and surfaces a real error.
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      // Mutations pause under the default 'online' mode too, which leaves
      // `await mutateAsync()` pending forever: no toast and no error for an
      // action that was never sent, and the write is lost if the process ends.
      networkMode: 'offlineFirst',
    },
  },
});
