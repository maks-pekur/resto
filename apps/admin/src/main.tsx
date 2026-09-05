import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Forbidden, RouteError, RoutePending } from '@/components/common/route-error';
import { isForbiddenRouteError } from '@/lib/auth/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ThemeProvider } from '@/components/common/theme-provider';
import { routeTree } from './route-tree';
import '@resto/config-tailwind/tokens.css';
import './styles.css';

// G-04: init Sentry before the React tree mounts so unhandled errors are captured.
// No-op when VITE_SENTRY_DSN is absent — dev builds without the var are unaffected.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export const router = createRouter({
  routeTree,
  basepath: '/admin',
  context: { queryClient },
  defaultPreload: 'intent',
  defaultErrorComponent: ({ error, reset }) =>
    isForbiddenRouteError(error) ? <Forbidden /> : <RouteError reset={reset} />,
  defaultPendingComponent: RoutePending,
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
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
