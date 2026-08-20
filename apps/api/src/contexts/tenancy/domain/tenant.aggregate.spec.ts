import { describe, it, expect } from 'vitest';
import { TenantSlug } from '@resto/domain';
import { StripeAccountId, Tenant } from './tenant.aggregate';

function makeTenant() {
  return Tenant.provision({
    slug: TenantSlug.parse('test-tenant-ok'),
    displayName: 'Test Tenant',
    country: 'ES',
    primaryDomainHostname: 'test-tenant-ok.menu.resto.app',
  });
}

describe('StripeAccountId (PAY-11)', () => {
  it('accepts a valid Stripe account id', () => {
    expect(StripeAccountId.safeParse('acct_1234567890').success).toBe(true);
  });

  it('rejects a string longer than 255 characters', () => {
    expect(StripeAccountId.safeParse('a'.repeat(256)).success).toBe(false);
  });
});

describe('Tenant.canAcceptPayments (D-06/D-39: real Stripe-linkage derivation)', () => {
  it('returns false before any Stripe account is linked', () => {
    const tenant = makeTenant();
    expect(tenant.canAcceptPayments()).toBe(false);
  });

  it('returns true once an account is linked and charges are enabled', () => {
    const tenant = makeTenant();
    tenant.linkStripeAccount('acct_123', 'express');
    tenant.applyStripeCapabilities({
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingStatus: 'complete',
      requirementsDue: null,
    });
    expect(tenant.canAcceptPayments()).toBe(true);
  });
});

describe('Tenant.linkStripeAccount', () => {
  it('sets the account id/type and moves onboarding status to pending', () => {
    const tenant = makeTenant();
    tenant.pullEvents();
    tenant.linkStripeAccount('acct_123', 'express');
    const snapshot = tenant.toSnapshot();
    expect(snapshot.stripeAccountId).toBe('acct_123');
    expect(snapshot.accountType).toBe('express');
    expect(snapshot.stripeOnboardingStatus).toBe('pending');
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'TenantPaymentAccountLinked',
      stripeAccountId: 'acct_123',
      accountType: 'express',
    });
  });
});

describe('Tenant.applyStripeCapabilities', () => {
  it('updates capability fields and raises TenantPaymentCapabilitiesApplied', () => {
    const tenant = makeTenant();
    tenant.pullEvents();
    tenant.applyStripeCapabilities({
      chargesEnabled: true,
      payoutsEnabled: false,
      onboardingStatus: 'pending',
      requirementsDue: ['individual.verification.document'],
    });
    const snapshot = tenant.toSnapshot();
    expect(snapshot.stripeChargesEnabled).toBe(true);
    expect(snapshot.stripePayoutsEnabled).toBe(false);
    expect(snapshot.stripeOnboardingStatus).toBe('pending');
    expect(snapshot.stripeRequirementsDue).toEqual(['individual.verification.document']);
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('TenantPaymentCapabilitiesApplied');
  });
});
