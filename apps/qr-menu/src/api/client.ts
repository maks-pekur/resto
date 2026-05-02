import type { MenuDto } from './types';

const env = import.meta.env as Record<string, string | undefined>;
const API_URL: string = env.VITE_API_URL ?? '';
const TENANT_SLUG_OVERRIDE: string | undefined = env.VITE_TENANT_SLUG;

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (TENANT_SLUG_OVERRIDE) {
    headers['x-tenant-slug'] = TENANT_SLUG_OVERRIDE;
  }
  return headers;
};

const apiUrl = (path: string): string => {
  // In production the qr-menu is served from `<slug>.menu.resto.app`
  // and the api answers same-origin, so a relative path is correct.
  // In dev, VITE_API_URL points the fetcher at `http://localhost:3000`.
  if (!API_URL) return path;
  return new URL(path, API_URL).toString();
};

/**
 * Fetch the published menu for the resolved tenant. The api resolves
 * the tenant from the request host (or the `X-Tenant-Slug` header in
 * development); a missing tenant returns 404 which surfaces here as
 * `MenuNotFoundError` so the UI can render the not-found state cleanly.
 */
export const fetchMenu = async (signal?: AbortSignal): Promise<MenuDto> => {
  const init: RequestInit = { headers: buildHeaders() };
  if (signal) init.signal = signal;
  const res = await fetch(apiUrl('/v1/menu'), init);
  if (res.status === 404) throw new MenuNotFoundError();
  if (!res.ok) throw new Error(`fetchMenu failed: ${res.status.toString()}`);
  return (await res.json()) as MenuDto;
};
