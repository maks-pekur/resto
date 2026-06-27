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
  /**
   * Tenant-scoped read of the active tenant's own row. Reads from ALS;
   * implementations MUST use `db.withTenant` (not `withoutTenant`) so
   * Postgres RLS enforces the second layer of isolation (ADR-0020 I-1).
   * Throws if no ALS tenant context is bound. Returns null if RLS
   * filters the row out (should be unreachable for a legitimate operator).
   */
  findCurrentTenant(): Promise<Tenant | null>;
  /**
   * Tenant-scoped list of the active tenant's domains. Same contract
   * as `findCurrentTenant`.
   */
  listCurrentTenantDomains(): Promise<readonly TenantDomain[]>;
  eraseTenant(id: TenantId, auditSalt: string, actorSubject: string): Promise<TenantSnapshot>;
  listScheduledForErasure(): Promise<readonly TenantSnapshot[]>;
}

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface CreateExpressAccountInput {
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly country?: string;
  readonly defaultCurrency?: string;
}

export interface CreateAccountLinkInput {
  readonly accountId: string;
  readonly refreshUrl: string;
  readonly returnUrl: string;
}

export interface CreatePaymentIntentInput {
  readonly orderId: string;
  readonly connectedAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  /** Caller-supplied attempt counter — changes the idempotency key on retry-after-same-order. */
  readonly attempt: number;
  readonly metadata: Record<string, string>;
}

export interface CancelPaymentIntentInput {
  readonly paymentIntentId: string;
  readonly connectedAccountId: string;
  readonly reason?: string;
}

export interface CreateRefundInput {
  readonly paymentIntentId: string;
  readonly connectedAccountId: string;
  readonly amountMinor?: number;
  readonly reason: string;
  readonly refundRequestId: string;
}

export interface RetrieveAccountInput {
  readonly accountId: string;
}

export interface CreateExpressAccountResult {
  readonly accountId: string;
}

export interface CreateAccountLinkResult {
  readonly url: string;
  readonly expiresAt: number;
}

export interface CreatePaymentIntentResult {
  readonly paymentIntentId: string;
  readonly clientSecret: string;
  readonly status: string;
}

export interface CancelPaymentIntentResult {
  readonly status: string;
}

export interface CreateRefundResult {
  readonly stripeRefundId: string;
  readonly status: string;
}

export interface RetrieveAccountResult {
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly requirementsDue: unknown;
}

export interface StripeConnectPort {
  /** Thin shim kept for backwards-compat with provision-tenant.service. */
  ensureExpressAccount(input: { tenantId: TenantId; displayName: string }): Promise<string | null>;
  createExpressAccount(input: CreateExpressAccountInput): Promise<CreateExpressAccountResult>;
  createAccountLink(input: CreateAccountLinkInput): Promise<CreateAccountLinkResult>;
  /** D-02: direct charge on connected account (stripeAccount option, no transfer_data.destination). */
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult>;
  cancelPaymentIntent(input: CancelPaymentIntentInput): Promise<CancelPaymentIntentResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  /** Used by boot ping + account.updated reconcile. */
  retrieveAccount(input: RetrieveAccountInput): Promise<RetrieveAccountResult>;
}

export const STRIPE_CONNECT_PORT = Symbol('STRIPE_CONNECT_PORT');

export interface BrandRepository {
  findByDomainHost(host: string): Promise<BrandSnapshot | null>;
  findBySlug(slug: BrandSlug): Promise<BrandSnapshot | null>;
  findByTenantAndSlug(tenantId: TenantId, slug: BrandSlug): Promise<BrandSnapshot | null>;
  findById(id: BrandId): Promise<BrandSnapshot | null>;
  /**
   * List brands belonging to a tenant. When `brandIds` is provided, the
   * result is filtered to that subset (used by the operator's "brands I
   * can see" path — the scope-reader returns either null = all, or a
   * non-empty allow-list). When `brandIds` is undefined, returns every
   * non-erased brand.
   *
   * Implementations MUST run inside the request's tenant context so RLS
   * scopes the read to the active tenant.
   */
  listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly BrandSnapshot[]>;
  /**
   * Persist a brand and its primary subdomain in one transaction.
   *
   * Idempotent — re-running with the same (tenantId, slug) is a no-op.
   * Implementations MUST insert with ON CONFLICT DO NOTHING so retries
   * after partial failure do not throw on the second attempt.
   */
  save(snapshot: BrandSnapshot, primaryDomainHostname: string): Promise<void>;
  /**
   * Return the slugs of every active (non-erased) brand whose slug is
   * either exactly `prefix` or starts with `prefix-` (RES-180). Used by
   * the slug-availability check to compute a free `prefix-N` suggestion
   * across ALL tenants — slug uniqueness is platform-wide
   * (`brands_slug_active_uq`).
   *
   * Runs system-context (`withoutTenant`); the lookup is global by
   * design.
   */
  findActiveSlugsByPrefix(prefix: string, limit: number): Promise<readonly string[]>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
