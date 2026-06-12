import 'server-only';
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

export const fetchMenuPublic = async (tenantSlug: string): Promise<MenuDto> => {
  const url = `${apiOrigin()}/v1/menu`;
  const res = await fetch(url, {
    headers: { 'x-tenant-slug': tenantSlug },
    next: { revalidate: 60 },
  });
  if (res.status === 404) throw new TenantNotFoundError();
  if (res.status === 403) throw new TenantSuspendedError();
  if (!res.ok) throw new Error(`fetchMenuPublic failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};
