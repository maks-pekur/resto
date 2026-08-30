import type { components } from '@resto/api-client';
import { apiFetch } from '@/lib/api-client';

type Schemas = components['schemas'];

export type DashboardKpis = Schemas['DashboardKpisResponseDto'];

export const DEFAULT_KPI_RANGE_DAYS = 28;

const STALE_KPIS = 60_000;

export const dashboardKpisQuery = (locationId: string, days: number = DEFAULT_KPI_RANGE_DAYS) => ({
  queryKey: ['analytics', 'dashboard', locationId, days] as const,
  queryFn: () =>
    apiFetch<DashboardKpis>(`/v1/analytics/dashboard?days=${String(days)}`, { locationId }),
  staleTime: STALE_KPIS,
});
