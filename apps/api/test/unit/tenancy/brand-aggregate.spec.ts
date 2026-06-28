import { describe, it, expect } from 'vitest';
import { type BrandId, TenantId } from '@resto/domain';
import { randomUUID } from 'node:crypto';
import { Brand } from '../../../src/contexts/tenancy/domain/brand.aggregate';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';

const makeBrandSnap = (overrides: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: randomUUID() as BrandId,
  tenantId: TenantId.parse(randomUUID()),
  slug: 'test-brand',
  displayName: 'Test Brand',
  status: 'active',
  theme: null,
  paymentProvider: 'stripe',
  accountType: null,
  defaultCurrency: 'EUR',
  stripeAccountId: null,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  stripeOnboardingStatus: 'not_started',
  stripeRequirementsDue: null,
  ...overrides,
});

describe('Brand.fromSnapshot', () => {
  it('reconstructs from snapshot without mutating it', () => {
    const snap = makeBrandSnap();
    const brand = Brand.fromSnapshot(snap);
    expect(brand.toSnapshot()).toMatchObject({ id: snap.id, slug: snap.slug });
  });

  it('starts with empty event queue', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap());
    expect(brand.pullEvents()).toHaveLength(0);
  });
});

describe('Brand.canAcceptPayments', () => {
  it('returns false when stripeAccountId is null', () => {
    const brand = Brand.fromSnapshot(
      makeBrandSnap({ stripeAccountId: null, stripeChargesEnabled: true }),
    );
    expect(brand.canAcceptPayments()).toBe(false);
  });

  it('returns false when stripeChargesEnabled is false', () => {
    const brand = Brand.fromSnapshot(
      makeBrandSnap({ stripeAccountId: 'acct_123', stripeChargesEnabled: false }),
    );
    expect(brand.canAcceptPayments()).toBe(false);
  });

  it('returns true when accountId is set AND chargesEnabled is true', () => {
    const brand = Brand.fromSnapshot(
      makeBrandSnap({ stripeAccountId: 'acct_123', stripeChargesEnabled: true }),
    );
    expect(brand.canAcceptPayments()).toBe(true);
  });
});

describe('Brand.linkPaymentAccount', () => {
  it('sets stripeAccountId, accountType, and transitions onboardingStatus to pending', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap());
    brand.linkPaymentAccount('acct_newid', 'express');
    const snap = brand.toSnapshot();
    expect(snap.stripeAccountId).toBe('acct_newid');
    expect(snap.accountType).toBe('express');
    expect(snap.stripeOnboardingStatus).toBe('pending');
  });

  it('pushes a BrandPaymentAccountLinked event', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap());
    brand.linkPaymentAccount('acct_newid', 'express');
    const events = brand.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('BrandPaymentAccountLinked');
  });

  it('drains events on a second pullEvents call', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap());
    brand.linkPaymentAccount('acct_newid', 'express');
    brand.pullEvents();
    expect(brand.pullEvents()).toHaveLength(0);
  });
});

describe('Brand.applyPaymentCapabilities', () => {
  it('updates all four capability fields on the snapshot', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap({ stripeAccountId: 'acct_123' }));
    brand.applyPaymentCapabilities({
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingStatus: 'complete',
      requirementsDue: null,
    });
    const snap = brand.toSnapshot();
    expect(snap.stripeChargesEnabled).toBe(true);
    expect(snap.stripePayoutsEnabled).toBe(true);
    expect(snap.stripeOnboardingStatus).toBe('complete');
    expect(snap.stripeRequirementsDue).toBeNull();
  });

  it('pushes a BrandPaymentCapabilitiesApplied event', () => {
    const brand = Brand.fromSnapshot(makeBrandSnap({ stripeAccountId: 'acct_123' }));
    brand.applyPaymentCapabilities({
      chargesEnabled: true,
      payoutsEnabled: false,
      onboardingStatus: 'pending',
      requirementsDue: ['eventually_due'],
    });
    const events = brand.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('BrandPaymentCapabilitiesApplied');
  });
});
