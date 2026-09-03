import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';

/**
 * Build a QueryClient for use inside a single test.
 *
 * `gcTime: Infinity` for both queries and mutations prevents TanStack Query
 * from scheduling real (ref'd) garbage-collection `setTimeout`s when a query
 * or mutation loses its last observer. Under Jest such timers are never
 * flushed: the default mutation gcTime is 5 minutes, and a pending ref'd
 * timer keeps the Node event loop (and therefore Jest) alive after the test
 * run has completed.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

export function TestQueryProvider({
  children,
  client,
}: {
  children: React.ReactNode;
  client?: QueryClient;
}) {
  const [queryClient] = React.useState(() => client ?? createTestQueryClient());

  // Dispose the client when the tree unmounts (e.g. Testing Library's
  // auto-cleanup after each test) so TanStack Query cancels any GC timers it
  // may have scheduled for mutations/queries created during the test. Query
  // caches cancel their timers in `clear()`, but mutation caches only cancel
  // theirs in `Mutation.destroy()`, so destroy outstanding mutations first.
  useEffect(() => {
    return () => {
      queryClient
        .getMutationCache()
        .getAll()
        .forEach((mutation) => mutation.destroy());
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
