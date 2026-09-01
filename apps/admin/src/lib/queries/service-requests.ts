import { apiFetch } from '@/lib/api-client';

export interface ServiceRequestApi {
  readonly id: string;
  readonly kind: 'waiter' | 'bill';
  readonly zoneName: string;
  readonly tableNumber: string;
  readonly createdAt: string;
}

interface ServiceRequestList {
  readonly items: readonly ServiceRequestApi[];
}

/** Polled rather than pushed: a raised hand is only interesting for the minute it is up. */
export const openServiceRequestsQuery = (locationId: string) => ({
  queryKey: ['service-requests', locationId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch<ServiceRequestList>('/v1/tenancy/service-requests', { locationId, signal }),
  refetchInterval: 15_000,
});

export const resolveServiceRequest = (id: string, locationId: string) =>
  // 204 carries no body — the call is the whole point.
  apiFetch<null>(`/v1/tenancy/service-requests/${id}/resolve`, {
    method: 'PATCH',
    locationId,
  });
