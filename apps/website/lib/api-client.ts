import 'server-only';
import { headers } from 'next/headers';
import type { MenuDto } from '@resto/api-client/public';
import { apiOrigin } from './env';

export class TenantNotFoundError extends Error {
  constructor() {
    super('No tenant resolved for this host.');
    this.name = 'TenantNotFoundError';
  }
}

export class TenantSuspendedError extends Error {
  constructor() {
    super('This restaurant is temporarily unavailable.');
    this.name = 'TenantSuspendedError';
  }
}

/**
 * Fetch the published menu for the brand identified by the incoming request
 * host. website is SSR, so it forwards its brand subdomain to the api as
 * `x-forwarded-host`; the api resolves the brand from it (under TRUST_PROXY).
 */
export const fetchMenuPublic = async (): Promise<MenuDto> => {
  const h = await headers();
  const host = h.get('host') ?? '';
  const res = await fetch(`${apiOrigin()}/v1/menu`, {
    headers: { 'x-forwarded-host': host },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new TenantNotFoundError();
  if (res.status === 403) throw new TenantSuspendedError();
  if (!res.ok) throw new Error(`fetchMenuPublic failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};
