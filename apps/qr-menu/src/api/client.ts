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

export const fetchAvailability = async (
  tableId: string | undefined,
  signal?: AbortSignal,
): Promise<MenuAvailability> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const params = new URLSearchParams();
  if (tableId) params.set('t', tableId);
  const query = params.toString();
  const url = query ? `/v1/menu/availability?${query}` : '/v1/menu/availability';
  const res = await fetch(url, init);
  if (res.status === 404) return { stoppedItemIds: [] };
  if (!res.ok) throw new Error(`fetchAvailability failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuAvailability>;
};

export interface ResolvedTable {
  tableId: string;
  zoneName: string;
  number: string;
}

export const fetchTable = async (
  tableId: string,
  signal?: AbortSignal,
): Promise<ResolvedTable | null> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch(`/v1/tables/${tableId}`, init);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchTable failed: ${res.status.toString()}`);
  return res.json() as Promise<ResolvedTable>;
};
