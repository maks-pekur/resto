import { describe, it, expect } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import { StripeAccountId, Tenant } from './tenant.aggregate';

function makeTenant() {
  return Tenant.provision({
    slug: TenantSlug.parse('test-tenant-ok'),
    displayName: 'Test Tenant',
    defaultCurrency: Currency.parse('EUR'),
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

describe('Tenant.canAcceptPayments (D-12)', () => {
  it('returns false when stripeAccountId is null and chargesEnabled is false', () => {
    const tenant = makeTenant();
    expect(tenant.canAcceptPayments()).toBe(false);
  });

  it('returns false when stripeAccountId is set but chargesEnabled is false', () => {
    const tenant = makeTenant();
    tenant.applyStripeCapabilities({
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingStatus: 'pending',
      requirementsDue: null,
    });
    expect(tenant.canAcceptPayments()).toBe(false);
  });

  it('returns false when chargesEnabled is true but stripeAccountId is null', () => {
    const tenant = makeTenant();
    tenant.applyStripeCapabilities({
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingStatus: 'complete',
      requirementsDue: null,
    });
    // no stripeAccountId set — canAcceptPayments must still be false
    expect(tenant.canAcceptPayments()).toBe(false);
  });

  it('returns true only when stripeAccountId is set AND chargesEnabled is true', () => {
    const tenant = makeTenant();
    const snap = tenant.toSnapshot();
    const tenantWithAccount = Tenant.fromSnapshot({
      ...snap,
      stripeAccountId: 'acct_test_123',
    });
    tenantWithAccount.applyStripeCapabilities({
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingStatus: 'complete',
      requirementsDue: null,
    });
    expect(tenantWithAccount.canAcceptPayments()).toBe(true);
  });
});

describe('Tenant.applyStripeCapabilities', () => {
  it('updates capability fields on the snapshot', () => {
    const tenant = makeTenant();
    const snap = tenant.toSnapshot();
    const tenantWithAccount = Tenant.fromSnapshot({
      ...snap,
      stripeAccountId: 'acct_test_456',
    });
    tenantWithAccount.applyStripeCapabilities({
      chargesEnabled: true,
      payoutsEnabled: false,
      onboardingStatus: 'restricted',
      requirementsDue: ['individual.id_number'],
    });
    const updated = tenantWithAccount.toSnapshot();
    expect(updated.stripeChargesEnabled).toBe(true);
    expect(updated.stripePayoutsEnabled).toBe(false);
    expect(updated.stripeOnboardingStatus).toBe('restricted');
    expect(updated.stripeRequirementsDue).toEqual(['individual.id_number']);
  });
});
