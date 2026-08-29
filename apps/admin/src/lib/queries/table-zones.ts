import { apiFetch } from '@/lib/api-client';

export interface TableView {
  readonly id: string;
  readonly number: string;
  readonly ordinal: number;
  readonly status: 'active' | 'archived';
  readonly qrUrl: string;
}

export interface TableZoneView {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly tables: readonly TableView[];
}

export interface TableZoneSummary {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
}

export interface ArchiveTableZoneResult {
  readonly zoneId: string;
  readonly archivedTableCount: number;
}

export interface CreateTableZoneInput {
  readonly name: string;
  readonly tableCount: number;
}

export interface ProblemDetails {
  readonly code?: string;
  readonly message?: string;
  readonly detail?: string;
}

// Mirrored from apps/api/src/contexts/tenancy/application/table-dto.ts — apps may not
// cross-import (module boundary rule), so these two caps are restated here.
export const MAX_TABLES_PER_BULK_CALL = 200;
export const MAX_ACTIVE_TABLES_PER_LOCATION = 500;

export const tableZonesQuery = (locationId: string) => ({
  queryKey: ['tenancy', 'table-zones', locationId] as const,
  queryFn: () => apiFetch<TableZoneView[]>('/v1/tenancy/table-zones', { locationId }),
  staleTime: 15_000,
});

export const createTableZoneMutation = (locationId: string, input: CreateTableZoneInput) =>
  apiFetch<TableZoneView>('/v1/tenancy/table-zones', {
    method: 'POST',
    body: input,
    locationId,
  });

export const renameTableZoneMutation = (locationId: string, zoneId: string, name: string) =>
  apiFetch<TableZoneSummary>(`/v1/tenancy/table-zones/${zoneId}`, {
    method: 'PATCH',
    body: { name },
    locationId,
  });

export const archiveTableZoneMutation = (locationId: string, zoneId: string) =>
  apiFetch<ArchiveTableZoneResult>(`/v1/tenancy/table-zones/${zoneId}/archive`, {
    method: 'PATCH',
    locationId,
  });

export const addTablesMutation = (locationId: string, zoneId: string, count: number) =>
  apiFetch<TableView[]>(`/v1/tenancy/table-zones/${zoneId}/tables`, {
    method: 'POST',
    body: { count },
    locationId,
  });

export const renameTableMutation = (
  locationId: string,
  zoneId: string,
  tableId: string,
  number: string,
) =>
  apiFetch<TableView>(`/v1/tenancy/table-zones/${zoneId}/tables/${tableId}`, {
    method: 'PATCH',
    body: { number },
    locationId,
  });

export const archiveTableMutation = (locationId: string, zoneId: string, tableId: string) =>
  apiFetch<TableView>(`/v1/tenancy/table-zones/${zoneId}/tables/${tableId}/archive`, {
    method: 'PATCH',
    locationId,
  });

/**
 * `attemptedNumber` lets a caller who knows the value the operator just typed name it in the
 * sentence — the server's own `tenancy.table_number_taken` message does not (10.3-07: the
 * domain error that would name it is unreachable over HTTP; only the generic unique-violation
 * catch fires).
 */
export const friendlyTableError = (
  status: number,
  body: ProblemDetails | null,
  context: { readonly attemptedNumber?: string } = {},
): string => {
  switch (body?.code) {
    case 'tenancy.table_bulk_limit_exceeded':
      return `A single request can create at most ${MAX_TABLES_PER_BULK_CALL.toString()} tables — split it into smaller batches.`;
    case 'tenancy.location_table_limit_reached':
      return `This location has reached its limit of ${MAX_ACTIVE_TABLES_PER_LOCATION.toString()} active tables.`;
    case 'tenancy.table_number_taken':
      return context.attemptedNumber
        ? `Table number "${context.attemptedNumber}" is already in use in this zone.`
        : (body.detail ?? 'That table number is already in use in this zone.');
    case 'tenancy.table_zone_not_found':
      return 'This zone could not be found. It may have been archived.';
    case 'tenancy.table_not_found':
      return 'This table could not be found. It may have already been archived.';
    case 'tenancy.table_zone_already_archived':
      return 'This zone has already been archived.';
    case 'tenancy.table_already_archived':
      return 'This table has already been archived.';
    default:
      return body?.detail ?? body?.message ?? `Request failed (${status.toString()}).`;
  }
};
