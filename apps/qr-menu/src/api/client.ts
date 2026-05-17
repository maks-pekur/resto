import type { MenuDto } from './types';

const API_URL: string = (import.meta.env as Record<string, string | undefined>).VITE_API_URL ?? '';
// `import.meta.env.DEV` is a static boolean Vite inlines at build time.
// In a prod build this expression becomes `false ? ... : undefined`, so
// the `import.meta.env.VITE_TENANT_SLUG` read and the downstream `x-tenant-slug`
// header construction are dead-code-eliminated. ADR-0020 I-3.
const TENANT_SLUG_OVERRIDE: string | undefined = import.meta.env.DEV
  ? (import.meta.env.VITE_TENANT_SLUG as string | undefined)
  : undefined;

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
