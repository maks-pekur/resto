import type { LocationId, TenantId } from '@resto/domain';
import type { LocationSnapshot } from './location.aggregate';
import type { Tenant, TenantSnapshot } from './tenant.aggregate';
import type { TenantDomain } from './tenant-domain';
import type { TableZoneSnapshot } from './table-zone.aggregate';
import type { RestaurantTableSnapshot } from './restaurant-table.aggregate';

export interface TenantRepository {
  findById(id: TenantId): Promise<TenantSnapshot | null>;
  findBySlug(slug: string): Promise<TenantSnapshot | null>;
  findByDomainHost(host: string): Promise<TenantSnapshot | null>;
  findByStripeAccountId(stripeAccountId: string): Promise<TenantSnapshot | null>;
  save(tenant: Tenant): Promise<void>;
  listDomains(id: TenantId): Promise<TenantDomain[]>;
  findCurrentTenant(): Promise<Tenant | null>;
  listCurrentTenantDomains(): Promise<readonly TenantDomain[]>;
  eraseTenant(id: TenantId, auditSalt: string, actorSubject: string): Promise<TenantSnapshot>;
  listScheduledForErasure(): Promise<readonly TenantSnapshot[]>;
}

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface LocationRepository {
  findById(id: LocationId): Promise<LocationSnapshot | null>;
  listForTenant(tenantId: TenantId): Promise<readonly LocationSnapshot[]>;
  save(snapshot: LocationSnapshot): Promise<void>;
  countScopedMembers(locationId: LocationId): Promise<number>;
  /** Removes a location that never took an order, along with its zones and tables. */
  deleteEmpty(locationId: LocationId, tenantId: TenantId): Promise<void>;
}

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');

export interface TableZoneWithTables extends TableZoneSnapshot {
  readonly tables: readonly RestaurantTableSnapshot[];
}

/**
 * The one row `findActiveTableForResolution` returns — the public guest resolution route has no
 * bound location, so this is deliberately narrower than `RestaurantTableSnapshot`.
 * `updatedAt` rides along for the public resolution route's ETag — never exposed in its response
 * body.
 */
export interface RestaurantTableResolution {
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
  readonly locationId: LocationId;
  readonly updatedAt: Date;
}

export interface TableSeedInput {
  readonly number: string;
  readonly ordinal: number;
}

export interface CreateZoneWithTablesInput {
  readonly locationId: LocationId;
  readonly name: string;
  readonly tables: readonly TableSeedInput[];
}

export interface AddTablesInput {
  readonly zoneId: string;
  readonly locationId: LocationId;
  readonly tables: readonly TableSeedInput[];
}

/**
 * Owns both `table_zones` and `restaurant_tables` — a table has no life outside its zone, and a
 * second repository would duplicate the location predicate every method here composes explicitly.
 */
export interface TableZoneRepository {
  listZonesWithTables(locationId: LocationId): Promise<readonly TableZoneWithTables[]>;
  findZoneById(zoneId: string, locationId: LocationId): Promise<TableZoneSnapshot | null>;
  findTableById(tableId: string, locationId: LocationId): Promise<RestaurantTableSnapshot | null>;
  findActiveTableForResolution(tableId: string): Promise<RestaurantTableResolution | null>;
  createZoneWithTables(input: CreateZoneWithTablesInput): Promise<TableZoneWithTables>;
  addTables(input: AddTablesInput): Promise<readonly RestaurantTableSnapshot[]>;
  saveZone(snapshot: TableZoneSnapshot): Promise<void>;
  saveTable(snapshot: RestaurantTableSnapshot): Promise<void>;
  archiveZoneCascade(
    zoneId: string,
    locationId: LocationId,
  ): Promise<{ zoneId: string; archivedTableCount: number }>;
  countActiveTables(locationId: LocationId): Promise<number>;
  maxOrdinalInZone(zoneId: string, locationId: LocationId): Promise<number>;
}

export const TABLE_ZONE_REPOSITORY = Symbol('TABLE_ZONE_REPOSITORY');
