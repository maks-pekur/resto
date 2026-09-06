import type { components } from '@resto/api-client';
import { apiFetch } from '@/lib/api-client';
import type { DateRange } from '@/lib/date-range';

type Schemas = components['schemas'];

export type DashboardKpis = Schemas['DashboardKpisResponseDto'];

const STALE_KPIS = 60_000;

export const dashboardKpisQuery = (locationId: string, range: DateRange) => ({
  queryKey: ['analytics', 'dashboard', locationId, range.from, range.to] as const,
  queryFn: () =>
    apiFetch<DashboardKpis>(`/v1/analytics/dashboard?from=${range.from}&to=${range.to}`, {
      locationId,
    }),
  staleTime: STALE_KPIS,
});
