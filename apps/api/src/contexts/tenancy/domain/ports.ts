import type { BrandId, BrandSlug, LocationId, TenantId, TenantSlug } from '@resto/domain';
import type { Brand, BrandSnapshot } from './brand.aggregate';
import type { LocationSnapshot } from './location.aggregate';
import type { Tenant, TenantSnapshot } from './tenant.aggregate';
import type { TenantDomain } from './tenant-domain';

export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | null>;
  findBySlug(slug: TenantSlug): Promise<Tenant | null>;
  findByDomainHost(host: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
  listDomains(id: TenantId): Promise<TenantDomain[]>;
  findCurrentTenant(): Promise<Tenant | null>;
  listCurrentTenantDomains(): Promise<readonly TenantDomain[]>;
  eraseTenant(id: TenantId, auditSalt: string, actorSubject: string): Promise<TenantSnapshot>;
  listScheduledForErasure(): Promise<readonly TenantSnapshot[]>;
}

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface BrandRepository {
  findByDomainHost(host: string): Promise<BrandSnapshot | null>;
  findBySlug(slug: BrandSlug): Promise<BrandSnapshot | null>;
  findByTenantAndSlug(tenantId: TenantId, slug: BrandSlug): Promise<BrandSnapshot | null>;
  findById(id: BrandId): Promise<BrandSnapshot | null>;
  listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly BrandSnapshot[]>;
  save(snapshot: BrandSnapshot, primaryDomainHostname: string): Promise<void>;
  findActiveSlugsByPrefix(prefix: string, limit: number): Promise<readonly string[]>;
  findByStripeAccountId(stripeAccountId: string): Promise<BrandSnapshot | null>;
  updatePaymentConnection(brand: Brand): Promise<void>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');

export interface LocationRepository {
  findById(id: LocationId): Promise<LocationSnapshot | null>;
  listForBrand(brandId: BrandId, tenantId: TenantId): Promise<readonly LocationSnapshot[]>;
  save(snapshot: LocationSnapshot): Promise<void>;
  countScopedMembers(locationId: LocationId): Promise<number>;
}

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');
