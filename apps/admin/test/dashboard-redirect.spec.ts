import { describe, expect, it } from 'vitest';
import { resolveLegacyDashboardRedirect } from '../src/routes/(protected)/dashboard-redirect.$';

describe('resolveLegacyDashboardRedirect', () => {
  it('strips the dashboard prefix for a normal deep link', () => {
    expect(resolveLegacyDashboardRedirect('acme/menu/items')).toBe('/acme/menu/items');
  });

  it('maps a bare /dashboard to the root', () => {
    expect(resolveLegacyDashboardRedirect('')).toBe('/');
  });

  it('neutralizes a protocol-relative open redirect', () => {
    expect(resolveLegacyDashboardRedirect('/evil.com')).toBe('/');
  });

  it('neutralizes a backslash protocol-relative open redirect', () => {
    expect(resolveLegacyDashboardRedirect('\\evil.com')).toBe('/');
  });

  it('keeps a payouts deep link intact', () => {
    expect(resolveLegacyDashboardRedirect('acme/payouts')).toBe('/acme/payouts');
  });
});
