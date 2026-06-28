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

describe('Tenant.canAcceptPayments (D-06 stub)', () => {
  it('always returns false — stripe capability moved to Brand aggregate', () => {
    const tenant = makeTenant();
    expect(tenant.canAcceptPayments()).toBe(false);
  });

  it('applyStripeCapabilities is a no-op stub that does not throw', () => {
    const tenant = makeTenant();
    expect(() =>
      tenant.applyStripeCapabilities({
        chargesEnabled: true,
        payoutsEnabled: true,
        onboardingStatus: 'complete',
        requirementsDue: null,
      }),
    ).not.toThrow();
  });
});
