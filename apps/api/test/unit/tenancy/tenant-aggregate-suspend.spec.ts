import { describe, expect, it } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import {
  TenantAlreadySuspendedError,
  TenantNotSuspendedError,
  TenantSuspensionNotAllowedError,
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

describe('Tenant suspend/resume', () => {
  it('suspend on active tenant flips status, advances updatedAt, pushes TenantSuspended event', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    const at = new Date('2026-06-01T00:00:00.000Z');
    tenant.suspend('operator@example.com', at);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('suspended');
    expect(snapshot.updatedAt).toEqual(at);
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'TenantSuspended',
      tenantId: snapshot.id,
      requestedBy: 'operator@example.com',
      suspendedAt: at,
      occurredAt: at,
    });
  });

  it('suspend on already-suspended tenant throws TenantAlreadySuspendedError, snapshot unchanged, no event', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.suspend('operator@example.com', new Date('2026-06-01T00:00:00.000Z'));
    const beforeSnapshot = tenant.toSnapshot();
    tenant.pullEvents();
    expect(() => tenant.suspend('other@example.com', new Date('2026-06-02T00:00:00.000Z'))).toThrow(
      TenantAlreadySuspendedError,
    );
    const afterSnapshot = tenant.toSnapshot();
    expect(afterSnapshot).toEqual(beforeSnapshot);
    expect(tenant.pullEvents()).toHaveLength(0);
  });

  it('suspend on archived tenant throws TenantSuspensionNotAllowedError, snapshot unchanged', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.archive(new Date('2026-06-01T00:00:00.000Z'));
    const beforeSnapshot = tenant.toSnapshot();
    tenant.pullEvents();
    expect(() =>
      tenant.suspend('operator@example.com', new Date('2026-06-02T00:00:00.000Z')),
    ).toThrow(TenantSuspensionNotAllowedError);
    expect(tenant.toSnapshot()).toEqual(beforeSnapshot);
    expect(tenant.pullEvents()).toHaveLength(0);
  });

  it('suspend on erased tenant throws TenantSuspensionNotAllowedError', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.scheduleOffboarding('user-123', new Date('2026-06-01T00:00:00.000Z'));
    tenant.executeErasure(new Date('2026-07-02T00:00:00.000Z'));
    tenant.pullEvents();
    expect(() => tenant.suspend('operator@example.com')).toThrow(TenantSuspensionNotAllowedError);
  });

  it('resume on suspended tenant flips status to active and pushes TenantResumed event', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.suspend('operator@example.com', new Date('2026-06-01T00:00:00.000Z'));
    tenant.pullEvents();
    const at = new Date('2026-06-15T00:00:00.000Z');
    tenant.resume(at);
    const snapshot = tenant.toSnapshot();
    expect(snapshot.status).toBe('active');
    expect(snapshot.updatedAt).toEqual(at);
    const events = tenant.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'TenantResumed',
      tenantId: snapshot.id,
      resumedAt: at,
      occurredAt: at,
    });
  });

  it('resume on active tenant throws TenantNotSuspendedError', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    expect(() => tenant.resume()).toThrow(TenantNotSuspendedError);
  });

  it('pullEvents drains events; subsequent call returns empty array', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.pullEvents();
    tenant.suspend('operator@example.com', new Date('2026-06-01T00:00:00.000Z'));
    expect(tenant.pullEvents()).toHaveLength(1);
    expect(tenant.pullEvents()).toHaveLength(0);
  });

  it('toSnapshot after suspend returns a snapshot with status="suspended"', () => {
    const tenant = Tenant.provision(baseProvisionInput);
    tenant.suspend('operator@example.com', new Date('2026-06-01T00:00:00.000Z'));
    expect(tenant.toSnapshot().status).toBe('suspended');
  });
});
