import type { MenuDto } from '@resto/api-client/public';

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

export interface FetchMenuOptions {
  /** Skip the HTTP cache. A revalidation answers 304 and leaves the old body in
   * place, and that body carries signed photo URLs that may already be dead —
   * the menu version has not changed, but the links inside it have. */
  readonly bypassCache?: boolean;
}

export const fetchMenu = async (
  signal?: AbortSignal,
  options: FetchMenuOptions = {},
): Promise<MenuDto> => {
  const init: RequestInit = options.bypassCache ? { cache: 'reload' } : {};
  if (signal) init.signal = signal;
  const res = await fetch('/v1/menu', init);
  if (res.status === 404) throw new MenuNotFoundError();
  if (!res.ok) throw new Error(`fetchMenu failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};

export interface MenuAvailability {
  stoppedItemIds: string[];
}

export const fetchAvailability = async (signal?: AbortSignal): Promise<MenuAvailability> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch('/v1/menu/availability', init);
  if (res.status === 404) return { stoppedItemIds: [] };
  if (!res.ok) throw new Error(`fetchAvailability failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuAvailability>;
};
