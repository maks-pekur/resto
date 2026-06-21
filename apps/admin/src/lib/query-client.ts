import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // apiFetch owns the single idempotent-GET 5xx retry (apps/CLAUDE.md); no Query-layer retry.
      retry: 0,
    },
    mutations: {
      retry: 0,
    },
  },
});
