import { apiFetch } from './api-client';
import { queryClient } from './query-client';
import { adminPath } from './admin-path';

export class TenantSwitchFailedError extends Error {
  constructor(message = 'Could not switch tenant.') {
    super(message);
    this.name = 'TenantSwitchFailedError';
  }
}

interface SwitchOrganizationResponse {
  readonly organizationId: string;
  readonly slug: string;
}

// Measured 2026-09-05 in Chromium (research M-10): location.assign to a same-origin path
// creates a new document, discarding the module-scope QueryClient; a router's pushState does not.
export const switchTenant = async (
  organizationId: string,
  next: string | (() => Promise<string>) = '/dashboard',
): Promise<void> => {
  const res = await apiFetch<SwitchOrganizationResponse>('/api/auth/switch-organization', {
    method: 'POST',
    body: { organizationId },
  });
  if (!res.ok || !res.data) throw new TenantSwitchFailedError();
  const resolvedNext = typeof next === 'function' ? await next() : next;
  queryClient.clear();
  window.location.assign(adminPath(resolvedNext));
};
