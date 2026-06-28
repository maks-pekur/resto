import type { BrandId, BrandTheme, TenantId } from '@resto/domain';

export type BrandOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

export interface ApplyBrandPaymentCapabilitiesInput {
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly onboardingStatus: BrandOnboardingStatus;
  readonly requirementsDue: unknown;
}

export interface BrandPaymentAccountLinkedEvent {
  readonly kind: 'BrandPaymentAccountLinked';
  readonly brandId: BrandId;
  readonly tenantId: TenantId;
  readonly stripeAccountId: string;
  readonly accountType: 'express' | 'standard';
  readonly occurredAt: Date;
}

export interface BrandPaymentCapabilitiesAppliedEvent {
  readonly kind: 'BrandPaymentCapabilitiesApplied';
  readonly brandId: BrandId;
  readonly tenantId: TenantId;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly onboardingStatus: BrandOnboardingStatus;
  readonly occurredAt: Date;
}

export type BrandDomainEvent =
  | BrandPaymentAccountLinkedEvent
  | BrandPaymentCapabilitiesAppliedEvent;

export interface BrandSnapshot {
  readonly id: BrandId;
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly displayName: string;
  readonly status: 'active' | 'suspended' | 'archived' | 'erased';
  readonly theme: BrandTheme | null;
  readonly paymentProvider: 'stripe';
  readonly accountType: 'express' | 'standard' | null;
  readonly defaultCurrency: string | null;
  readonly stripeAccountId: string | null;
  readonly stripeChargesEnabled: boolean;
  readonly stripePayoutsEnabled: boolean;
  readonly stripeOnboardingStatus: BrandOnboardingStatus;
  readonly stripeRequirementsDue: unknown;
}

export class Brand {
  readonly #events: BrandDomainEvent[] = [];

  private constructor(private snapshot: BrandSnapshot) {}

  static fromSnapshot(snapshot: BrandSnapshot): Brand {
    return new Brand(snapshot);
  }

  toSnapshot(): BrandSnapshot {
    return this.snapshot;
  }

  canAcceptPayments(): boolean {
    return this.snapshot.stripeAccountId !== null && this.snapshot.stripeChargesEnabled;
  }

  linkPaymentAccount(accountId: string, accountType: 'express' | 'standard'): void {
    this.snapshot = {
      ...this.snapshot,
      stripeAccountId: accountId,
      accountType,
      stripeOnboardingStatus: 'pending',
    };
    this.#events.push({
      kind: 'BrandPaymentAccountLinked',
      brandId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      stripeAccountId: accountId,
      accountType,
      occurredAt: new Date(),
    });
  }

  applyPaymentCapabilities(input: ApplyBrandPaymentCapabilitiesInput): void {
    this.snapshot = {
      ...this.snapshot,
      stripeChargesEnabled: input.chargesEnabled,
      stripePayoutsEnabled: input.payoutsEnabled,
      stripeOnboardingStatus: input.onboardingStatus,
      stripeRequirementsDue: input.requirementsDue,
    };
    this.#events.push({
      kind: 'BrandPaymentCapabilitiesApplied',
      brandId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      chargesEnabled: input.chargesEnabled,
      payoutsEnabled: input.payoutsEnabled,
      onboardingStatus: input.onboardingStatus,
      occurredAt: new Date(),
    });
  }

  pullEvents(): BrandDomainEvent[] {
    const events = this.#events.slice();
    this.#events.length = 0;
    return events;
  }
}
