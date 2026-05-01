import { describe, expect, it } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import { TenantAlreadyArchivedError } from '../../../src/contexts/tenancy/domain/errors';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const NOW = new Date('2026-05-01T00:00:00.000Z');

const baseProvisionInput = {
  slug: TenantSlug.parse('cafe-roma'),
  displayName: 'Cafe Roma',
  defaultCurrency: Currency.parse('USD'),
  primaryDomainHostname: 'cafe-roma.menu.resto.app',
  now: NOW,
};

describe('Tenant.provision', () => {
  it('creates an active tenant with the auto subdomain as primary', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('active');
    expect(snapshot.primaryDomain.domain).toBe('cafe-roma.menu.resto.app');
    expect(snapshot.primaryDomain.isPrimary).toBe(true);
    expect(snapshot.primaryDomain.kind).toBe('subdomain');
    expect(snapshot.customDomains).toHaveLength(0);
    expect(snapshot.archivedAt).toBeNull();
    expect(snapshot.locale).toBe('en');
  });

  it('raises a TenantProvisioned event with payload matching the contract', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'TenantProvisioned',
      slug: 'cafe-roma',
      displayName: 'Cafe Roma',
      defaultCurrency: 'USD',
    });
  });

  it('drains events on a second pullEvents call', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    expect(tenant.pullEvents()).toHaveLength(1);
    expect(tenant.pullEvents()).toHaveLength(0);
  });
});

describe('Tenant.archive', () => {
  it('flips the status and raises a TenantArchived event', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    tenant.archive(new Date('2026-06-01T00:00:00.000Z'));
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('archived');
    expect(snapshot.archivedAt).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('TenantArchived');
  });

  it('throws TenantAlreadyArchivedError when called on an archived tenant', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.archive();
    expect(() => tenant.archive()).toThrow(TenantAlreadyArchivedError);
  });
});
