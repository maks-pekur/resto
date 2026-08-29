import type { MenuDto } from '@resto/api-client/public';

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

export const fetchMenu = async (signal?: AbortSignal): Promise<MenuDto> => {
  const init: RequestInit = {};
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
