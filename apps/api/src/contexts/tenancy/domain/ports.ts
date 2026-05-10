import type { BrandId, BrandSlug, TenantId, TenantSlug } from '@resto/domain';
import type { BrandSnapshot } from './brand.aggregate';
import type { Tenant, TenantSnapshot } from './tenant.aggregate';
import type { TenantDomain } from './tenant-domain';

/**
 * Repository port for the `Tenant` aggregate. Implemented by
 * `infrastructure/tenant-drizzle.repository.ts`; bounded-context code
 * depends on this interface only.
 */
export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | null>;
  findBySlug(slug: TenantSlug): Promise<Tenant | null>;
  findByDomainHost(host: string): Promise<Tenant | null>;
  /**
   * Persist the aggregate. Implementations MUST:
   *  1. upsert the tenant row + its domain rows
   *  2. append every `tenant.pullEvents()` event into the outbox
   *  3. do (1) and (2) in the same DB transaction
   */
  save(tenant: Tenant): Promise<void>;
  listDomains(id: TenantId): Promise<TenantDomain[]>;
  eraseTenant(id: TenantId, auditSalt: string): Promise<TenantSnapshot>;
  listScheduledForErasure(): Promise<readonly TenantSnapshot[]>;
}

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

/**
 * Stripe Connect onboarding port — placeholder. Payments runtime is
 * MVP-2 (ADR-0010). The port exists today so the application service
 * already speaks to an interface; the production adapter wires up the
 * Stripe SDK in a later ticket without touching application code.
 */
export interface StripeConnectPort {
  /** Returns the Stripe Express account id if/when an account is created. */
  ensureExpressAccount(input: { tenantId: TenantId; displayName: string }): Promise<string | null>;
}

export const STRIPE_CONNECT_PORT = Symbol('STRIPE_CONNECT_PORT');

export interface BrandRepository {
  findByDomainHost(host: string): Promise<BrandSnapshot | null>;
  findBySlug(slug: BrandSlug): Promise<BrandSnapshot | null>;
  findByTenantAndSlug(tenantId: TenantId, slug: BrandSlug): Promise<BrandSnapshot | null>;
  findById(id: BrandId): Promise<BrandSnapshot | null>;
  /**
   * Persist a brand and its primary subdomain in one transaction.
   *
   * Idempotent — re-running with the same (tenantId, slug) is a no-op.
   * Implementations MUST insert with ON CONFLICT DO NOTHING so retries
   * after partial failure do not throw on the second attempt.
   */
  save(snapshot: BrandSnapshot, primaryDomainHostname: string): Promise<void>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
