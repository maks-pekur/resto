import type { LocationId, TenantId } from '@resto/domain';
import type { LocationSnapshot } from './location.aggregate';
import type { Tenant, TenantSnapshot } from './tenant.aggregate';
import type { TenantDomain } from './tenant-domain';

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
}

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');
