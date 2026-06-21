import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <I18nextProvider i18n={i18n}>
      <Outlet />
    </I18nextProvider>
  ),
});
