import { apiFetch } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

export interface LocationContactsView {
  readonly phone?: string;
  readonly email?: string;
}

export interface LocationView {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly timezone: string | null;
  readonly contacts: LocationContactsView | null;
  readonly status: 'active' | 'archived';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface PinnableLocation {
  readonly id: string;
  readonly name: string;
  /** The location's address in the admin URL. */
  readonly slug: string;
}

export interface CreateLocationInput {
  readonly name: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Omitted inherits the tenant's zone — the server decides. */
  readonly timezone?: string | null;
  readonly contacts: LocationContactsView | null;
}

export type UpdateLocationInput = Partial<CreateLocationInput>;

export const updateLocationMutation = (id: string, input: UpdateLocationInput) =>
  apiFetch<LocationView>(`/v1/tenancy/locations/${id}`, { method: 'PATCH', body: input });

interface ProblemDetails {
  readonly code?: string;
  readonly message?: string;
  readonly detail?: string;
}

export const tenantLocationsQuery = () => ({
  queryKey: ['locations'] as const,
  queryFn: () => apiFetch<LocationView[]>('/v1/tenancy/locations'),
  staleTime: 30_000,
});

export const meLocationsQuery = () => ({
  queryKey: ['identity', 'me-locations'] as const,
  queryFn: () => apiFetch<{ locations: PinnableLocation[] }>('/v1/me/locations'),
  staleTime: 30_000,
});

// NOTE: the client-side call to `POST /v1/me/set-active-location` was removed on 2026-08-30
// along with the location switcher. The endpoint and the server-side initial pin both remain —
// a staff member's location authority is still that pin, not the URL (D-12) — but nothing in
// the admin can change it any more. A manager covering two points is therefore fixed to
// whichever location the initial pin chose. Phase 10.5 ("Location as a filter, not a mode") is
// where staff stop depending on a pinned location at all.

export const activeLocationIdQuery = () => ({
  queryKey: ['identity', 'active-location'] as const,
  queryFn: async (): Promise<string | null> => {
    const session = await authClient.getSession();
    const sessionData =
      session.data !== null
        ? (session.data as { session?: { activeLocationId?: string | null } }).session
        : undefined;
    return sessionData?.activeLocationId ?? null;
  },
  staleTime: 0,
});

export const createLocationMutation = (input: CreateLocationInput) =>
  apiFetch<LocationView>('/v1/tenancy/locations', {
    method: 'POST',
    body: input,
  });

export const archiveLocationMutation = (id: string) =>
  apiFetch<{ scopedMemberCount: number }>(`/v1/tenancy/locations/${id}/archive`, {
    method: 'PATCH',
  });

export const friendlyLocationError = (status: number, body: ProblemDetails | null): string => {
  if (status === 403) return 'Owner access required.';
  if (status === 404) return 'Location not found.';
  return body?.detail ?? body?.message ?? `Request failed (${status.toString()}).`;
};
