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

export const fetchMenuPublic = async (): Promise<MenuDto> => {
  const h = await headers();
  const host = h.get('host') ?? '';
  const res = await fetch(`${apiOrigin()}/v1/menu`, {
    headers: { 'x-forwarded-host': host },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new TenantNotFoundError();
  if (res.status === 403) throw new TenantSuspendedError();
  if (!res.ok) throw new Error(`fetchMenuPublic failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};

export interface MenuAvailability {
  stoppedItemIds: string[];
}

export const fetchAvailabilityPublic = async (): Promise<MenuAvailability> => {
  const h = await headers();
  const host = h.get('host') ?? '';
  const res = await fetch(`${apiOrigin()}/v1/menu/availability`, {
    headers: { 'x-forwarded-host': host },
    next: { revalidate: 5 },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return { stoppedItemIds: [] };
  if (!res.ok) throw new Error(`fetchAvailabilityPublic failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuAvailability>;
};
