import { randomUUID } from 'node:crypto';
import {
  currencyForCountry,
  defaultLocaleForCountry,
  TenantId,
  TenantSlug,
  type TenantTheme,
  type CountryCodeValue,
  type Currency,
} from '@resto/domain';
import { z } from 'zod';
import type { TenantDomain } from './tenant-domain';

// PAY-11: .max(255) bounds oversized externally-supplied ids on the webhook parse path.
export const StripeAccountId = z.string().min(1).max(255);
import type { TenantDomainEvent } from './events';
import {
  TenantAlreadyArchivedError,
  TenantAlreadySuspendedError,
  TenantErasureTooEarlyError,
  TenantNotSuspendedError,
  TenantOffboardingCoolOffExpiredError,
  TenantOffboardingNotAllowedError,
  TenantSetupNotPendingError,
  TenantSuspensionNotAllowedError,
} from './errors';

const COOL_OFF_DAYS = 30;
const COOL_OFF_MS = COOL_OFF_DAYS * 24 * 60 * 60 * 1000;

export type TenantStatus =
  | 'pending_setup'
  | 'active'
  | 'suspended'
  | 'archived'
  | 'pending_offboarding'
  | 'erased';

/**
 * Statuses whose public surface (QR menu, marketing site) stays live.
 * Single source of truth for read-enforcement; every status NOT in this
 * set goes dark on the public read path (AUDIT #21).
 */
export const SERVABLE_STATUSES: ReadonlySet<TenantStatus> = new Set<TenantStatus>(['active']);

export const isPubliclyServable = (status: TenantStatus): boolean => SERVABLE_STATUSES.has(status);

// (handle-stripe-event.service.ts imports it from this location).
export type StripeOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

export type TenantLegalForm = 'IP' | 'OOO' | 'LLC' | 'SOLE_PROP' | 'OTHER';

export type TenantPaymentAccountType = 'express' | 'standard';

export interface TenantSnapshot {
  readonly id: TenantId;
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly status: TenantStatus;
  readonly locale: string;
  readonly country: CountryCodeValue;
  readonly defaultCurrency: Currency;
  readonly theme: TenantTheme | null;
  readonly legalName: string | null;
  readonly legalForm: TenantLegalForm | null;
  readonly taxId: string | null;
  readonly stripeAccountId: string | null;
  readonly paymentProvider: 'stripe';
  readonly accountType: TenantPaymentAccountType | null;
  readonly stripeChargesEnabled: boolean;
  readonly stripePayoutsEnabled: boolean;
  readonly stripeOnboardingStatus: StripeOnboardingStatus;
  readonly stripeRequirementsDue: string[] | null;
  readonly fiscalizationConfig: Record<string, unknown> | null;
  readonly primaryDomain: TenantDomain;
  readonly customDomains: readonly TenantDomain[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly offboardingScheduledAt: Date | null;
  readonly offboardingExecutedAt: Date | null;
  readonly offboardingRequestedBy: string | null;
}

export interface ApplyStripeCapabilitiesInput {
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly onboardingStatus: StripeOnboardingStatus;
  readonly requirementsDue: string[] | null;
}

export interface ProvisionInput {
  readonly slug: TenantSlug;
  readonly displayName: string;
  readonly country: CountryCodeValue;
  /** Defaults to `defaultLocaleForCountry(country)` (D-35) when omitted. */
  readonly locale?: string;
  /** Hostname format `<slug>.menu.resto.app` — passed by the application service. */
  readonly primaryDomainHostname: string;
  /**
   * D-25/D-30 (10.2 plan 13): defaults to `'active'`. Signup provisions
   * `'pending_setup'` so an owner who has not yet named the restaurant
   * cannot be mistaken for one who has; onboarding's `finalizeSetup`
   * is the only path that flips it to `'active'`.
   */
  readonly status?: TenantStatus;
  readonly now?: Date;
}

export interface FinalizeSetupInput {
  readonly displayName: string;
  readonly slug: TenantSlug;
  /** Hostname format `<slug>.menu.resto.app` — passed by the application service. */
  readonly primaryDomainHostname: string;
}

/**
 * Aggregate root for the tenancy bounded context. Owns lifecycle
 * (provision / archive) plus invariants over the tenant's domain
 * mappings. Pure — no DB, no broker, no framework imports.
 *
 * The repository drains `pullEvents()` after `save` and translates the
 * events into outbox rows using contracts from `@resto/events`.
 */
export class Tenant {
  readonly #events: TenantDomainEvent[] = [];

  private constructor(private snapshot: TenantSnapshot) {}

  static fromSnapshot(snapshot: TenantSnapshot): Tenant {
    return new Tenant(snapshot);
  }

  static provision(input: ProvisionInput): Tenant {
    const now = input.now ?? new Date();
    const id = TenantId.parse(randomUUID());
    const primaryDomain: TenantDomain = {
      id: randomUUID(),
      tenantId: id,
      domain: input.primaryDomainHostname,
      kind: 'subdomain',
      isPrimary: true,
      verifiedAt: now,
      createdAt: now,
    };
    const defaultCurrency = currencyForCountry(input.country) as Currency;
    const snapshot: TenantSnapshot = {
      id,
      slug: input.slug,
      displayName: input.displayName,
      status: input.status ?? 'active',
      locale: input.locale ?? defaultLocaleForCountry(input.country),
      country: input.country,
      defaultCurrency,
      theme: null,
      legalName: null,
      legalForm: null,
      taxId: null,
      stripeAccountId: null,
      paymentProvider: 'stripe',
      accountType: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeOnboardingStatus: 'not_started',
      stripeRequirementsDue: null,
      fiscalizationConfig: null,
      primaryDomain,
      customDomains: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      offboardingScheduledAt: null,
      offboardingExecutedAt: null,
      offboardingRequestedBy: null,
    };
    const tenant = new Tenant(snapshot);
    tenant.#events.push({
      kind: 'TenantProvisioned',
      tenantId: snapshot.id,
      slug: snapshot.slug,
      displayName: snapshot.displayName,
      defaultCurrency: snapshot.defaultCurrency,
      occurredAt: now,
    });
    return tenant;
  }

  /**
   * D-30/D-31 (10.2 plan 13): the only path off `'pending_setup'`. Guards
   * against a race between two concurrent onboarding submits on the same
   * tenant — the identity layer performs the same check before calling
   * in, but the aggregate re-asserts it so a direct caller can never
   * silently rename an already-active restaurant through this path.
   */
  finalizeSetup(input: FinalizeSetupInput, now: Date = new Date()): void {
    if (this.snapshot.status !== 'pending_setup') {
      throw new TenantSetupNotPendingError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      displayName: input.displayName,
      slug: input.slug,
      status: 'active',
      primaryDomain: { ...this.snapshot.primaryDomain, domain: input.primaryDomainHostname },
      updatedAt: now,
    };
  }

  archive(now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new TenantAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantArchived',
      tenantId: this.snapshot.id,
      occurredAt: now,
    });
  }

  suspend(requestedBy: string, now: Date = new Date()): void {
    if (this.snapshot.status === 'suspended') {
      throw new TenantAlreadySuspendedError(this.snapshot.id);
    }
    if (this.snapshot.status !== 'active') {
      throw new TenantSuspensionNotAllowedError(this.snapshot.id, this.snapshot.status);
    }
    this.snapshot = { ...this.snapshot, status: 'suspended', updatedAt: now };
    this.#events.push({
      kind: 'TenantSuspended',
      tenantId: this.snapshot.id,
      requestedBy,
      suspendedAt: now,
      occurredAt: now,
    });
  }

  resume(now: Date = new Date()): void {
    if (this.snapshot.status !== 'suspended') {
      throw new TenantNotSuspendedError(this.snapshot.id, this.snapshot.status);
    }
    this.snapshot = { ...this.snapshot, status: 'active', updatedAt: now };
    this.#events.push({
      kind: 'TenantResumed',
      tenantId: this.snapshot.id,
      resumedAt: now,
      occurredAt: now,
    });
  }

  scheduleOffboarding(requestedBy: string, now: Date = new Date()): void {
    const status = this.snapshot.status;
    if (status !== 'active' && status !== 'archived') {
      throw new TenantOffboardingNotAllowedError(this.snapshot.id, status);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'pending_offboarding',
      archivedAt: this.snapshot.archivedAt ?? now,
      offboardingScheduledAt: now,
      offboardingRequestedBy: requestedBy,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantOffboardingScheduled',
      tenantId: this.snapshot.id,
      requestedBy,
      scheduledAt: now,
      occurredAt: now,
    });
  }

  cancelOffboarding(now: Date = new Date()): void {
    if (this.snapshot.status !== 'pending_offboarding') {
      throw new TenantOffboardingNotAllowedError(this.snapshot.id, this.snapshot.status);
    }
    const scheduledAt = this.snapshot.offboardingScheduledAt;
    if (scheduledAt === null || now.getTime() >= scheduledAt.getTime() + COOL_OFF_MS) {
      throw new TenantOffboardingCoolOffExpiredError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'active',
      archivedAt: null,
      offboardingScheduledAt: null,
      offboardingRequestedBy: null,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantOffboardingCancelled',
      tenantId: this.snapshot.id,
      cancelledAt: now,
      occurredAt: now,
    });
  }

  executeErasure(now: Date = new Date()): void {
    if (this.snapshot.status === 'erased') {
      return;
    }
    if (this.snapshot.status !== 'pending_offboarding') {
      throw new TenantOffboardingNotAllowedError(this.snapshot.id, this.snapshot.status);
    }
    const scheduledAt = this.snapshot.offboardingScheduledAt;
    if (scheduledAt === null || now.getTime() < scheduledAt.getTime() + COOL_OFF_MS) {
      throw new TenantErasureTooEarlyError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'erased',
      displayName: '[erased]',
      slug: TenantSlug.parse(`erased-${this.snapshot.id.slice(0, 8)}-${Date.now().toString(36)}`),
      offboardingExecutedAt: now,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantErasureCompleted',
      tenantId: this.snapshot.id,
      executedAt: now,
      occurredAt: now,
    });
  }

  linkStripeAccount(
    accountId: string,
    accountType: TenantPaymentAccountType,
    now: Date = new Date(),
  ): void {
    this.snapshot = {
      ...this.snapshot,
      stripeAccountId: accountId,
      accountType,
      stripeOnboardingStatus: 'pending',
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantPaymentAccountLinked',
      tenantId: this.snapshot.id,
      stripeAccountId: accountId,
      accountType,
      occurredAt: now,
    });
  }

  applyStripeCapabilities(input: ApplyStripeCapabilitiesInput, now: Date = new Date()): void {
    this.snapshot = {
      ...this.snapshot,
      stripeChargesEnabled: input.chargesEnabled,
      stripePayoutsEnabled: input.payoutsEnabled,
      stripeOnboardingStatus: input.onboardingStatus,
      stripeRequirementsDue: input.requirementsDue,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'TenantPaymentCapabilitiesApplied',
      tenantId: this.snapshot.id,
      chargesEnabled: input.chargesEnabled,
      payoutsEnabled: input.payoutsEnabled,
      onboardingStatus: input.onboardingStatus,
      occurredAt: now,
    });
  }

  canAcceptPayments(): boolean {
    return this.snapshot.stripeAccountId !== null && this.snapshot.stripeChargesEnabled;
  }

  isPubliclyServable(): boolean {
    return isPubliclyServable(this.snapshot.status);
  }

  toSnapshot(): TenantSnapshot {
    return this.snapshot;
  }

  pullEvents(): TenantDomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return events;
  }
}
