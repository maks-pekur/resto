import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { Route as rootRoute } from './routes/__root';
import { Route as indexRoute } from './routes/index';
import '@resto/config-tailwind/tokens.css';
import './styles.css';

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found.');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </StrictMode>,
);
