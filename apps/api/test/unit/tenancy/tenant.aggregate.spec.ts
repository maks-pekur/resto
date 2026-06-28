import { describe, expect, it } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import {
  TenantAlreadyArchivedError,
  TenantErasureTooEarlyError,
  TenantOffboardingCoolOffExpiredError,
  TenantOffboardingNotAllowedError,
} from '../../../src/contexts/tenancy/domain/errors';
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

describe('Tenant.scheduleOffboarding', () => {
  it('transitions active → pending_offboarding and emits TenantOffboardingScheduled', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    const now = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', now);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('pending_offboarding');
    expect(snapshot.offboardingScheduledAt).toEqual(now);
    expect(snapshot.offboardingRequestedBy).toBe('user-123');
    expect(snapshot.archivedAt).toEqual(now);
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('TenantOffboardingScheduled');
  });

  it('transitions archived → pending_offboarding (preserves prior archivedAt)', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.archive(new Date('2026-05-01T00:00:00Z'));
    tenant.pullEvents();
    const now = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', now);
    expect(tenant.toSnapshot().status).toBe('pending_offboarding');
    expect(tenant.toSnapshot().archivedAt).toEqual(new Date('2026-05-01T00:00:00Z'));
  });

  it('rejects schedule from pending_offboarding', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.scheduleOffboarding('user-123', new Date());
    expect(() => tenant.scheduleOffboarding('user-456', new Date())).toThrow(
      TenantOffboardingNotAllowedError,
    );
  });
});

describe('Tenant.cancelOffboarding', () => {
  it('within cool-off, transitions back to active and clears columns', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    const scheduledAt = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', scheduledAt);
    tenant.pullEvents();
    const cancelAt = new Date('2026-06-15T10:00:00Z');
    tenant.cancelOffboarding(cancelAt);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('active');
    expect(snapshot.offboardingScheduledAt).toBeNull();
    expect(snapshot.offboardingRequestedBy).toBeNull();
    expect(snapshot.archivedAt).toBeNull();
    expect(tenant.pullEvents()[0]?.kind).toBe('TenantOffboardingCancelled');
  });

  it('after 30-day cool-off, throws TenantOffboardingCoolOffExpiredError', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    const scheduledAt = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', scheduledAt);
    const cancelAt = new Date('2026-07-02T10:00:00Z');
    expect(() => tenant.cancelOffboarding(cancelAt)).toThrow(TenantOffboardingCoolOffExpiredError);
  });

  it('rejects cancel from non-pending_offboarding state', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    expect(() => tenant.cancelOffboarding()).toThrow(TenantOffboardingNotAllowedError);
  });
});

describe('Tenant.executeErasure', () => {
  it('after 30-day cool-off, transitions to erased and tombstones', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    const scheduledAt = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', scheduledAt);
    tenant.pullEvents();
    const eraseAt = new Date('2026-07-02T10:00:00Z');
    tenant.executeErasure(eraseAt);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('erased');
    expect(snapshot.displayName).toBe('[erased]');
    expect(snapshot.slug).toMatch(/^erased-/);
    expect(snapshot.offboardingExecutedAt).toEqual(eraseAt);
    expect(tenant.pullEvents()[0]?.kind).toBe('TenantErasureCompleted');
  });

  it('before cool-off expires, throws TenantErasureTooEarlyError', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    const scheduledAt = new Date('2026-06-01T10:00:00Z');
    tenant.scheduleOffboarding('user-123', scheduledAt);
    const eraseAt = new Date('2026-06-15T10:00:00Z');
    expect(() => tenant.executeErasure(eraseAt)).toThrow(TenantErasureTooEarlyError);
  });

  it('idempotent: calling on already-erased tenant is a no-op', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.scheduleOffboarding('user-123', new Date('2026-06-01T10:00:00Z'));
    tenant.executeErasure(new Date('2026-07-02T10:00:00Z'));
    tenant.pullEvents();
    expect(() => tenant.executeErasure(new Date('2026-08-01T10:00:00Z'))).not.toThrow();
    expect(tenant.pullEvents()).toHaveLength(0);
  });
});
