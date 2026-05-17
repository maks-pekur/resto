import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { OffboardTenantService } from '../../../src/contexts/tenancy/application/offboard-tenant.service';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import { TenantNotFoundError } from '../../../src/contexts/tenancy/domain/errors';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { Env } from '../../../src/config/env.schema';

const fakeId = '00000000-0000-4000-8000-000000000001';

const baseProvisionInput = () => ({
  slug: TenantSlug.parse('cafe-roma'),
  displayName: 'Cafe Roma',
  defaultCurrency: Currency.parse('USD'),
  primaryDomainHostname: 'cafe-roma.menu.resto.app',
});

const baseEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    AUDIT_ERASURE_SALT: 'unit-test-salt-32-chars-padding-aaaa',
    ...overrides,
  }) as Env;

const buildRepoMock = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn(),
  findByDomainHost: vi.fn(),
  listDomains: vi.fn(),
  save: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn(),
});

describe('OffboardTenantService', () => {
  it('schedule loads, mutates, and saves the aggregate', async () => {
    const tenant = Tenant.provision(baseProvisionInput());
    const repo = buildRepoMock();
    repo.findById = vi.fn().mockResolvedValue(tenant);
    const service = new OffboardTenantService(repo, baseEnv());
    const result = await service.schedule({
      tenantId: tenant.toSnapshot().id,
      requestedBy: 'user-abc',
    });
    expect(result.status).toBe('pending_offboarding');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('schedule throws TenantNotFoundError when tenant missing', async () => {
    const repo = buildRepoMock();
    repo.findById = vi.fn().mockResolvedValue(null);
    const service = new OffboardTenantService(repo, baseEnv());
    await expect(service.schedule({ tenantId: fakeId, requestedBy: 'user-abc' })).rejects.toThrow(
      TenantNotFoundError,
    );
  });

  it('cancel loads, mutates, saves', async () => {
    const tenant = Tenant.provision(baseProvisionInput());
    tenant.scheduleOffboarding('user-abc');
    tenant.pullEvents();
    const repo = buildRepoMock();
    repo.findById = vi.fn().mockResolvedValue(tenant);
    const service = new OffboardTenantService(repo, baseEnv());
    const result = await service.cancel({ tenantId: tenant.toSnapshot().id });
    expect(result.status).toBe('active');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('executeErasure delegates to repo with the env salt', async () => {
    const tenant = Tenant.provision(baseProvisionInput());
    tenant.scheduleOffboarding('user-abc', new Date('2026-06-01T10:00:00Z'));
    tenant.executeErasure(new Date('2026-07-02T10:00:00Z'));
    const erasedSnapshot = tenant.toSnapshot();
    const repo = buildRepoMock();
    repo.eraseTenant = vi.fn().mockResolvedValue(erasedSnapshot);
    const service = new OffboardTenantService(repo, baseEnv());
    const result = await service.executeErasure({ tenantId: erasedSnapshot.id });
    expect(result.status).toBe('erased');
    expect(repo.eraseTenant).toHaveBeenCalledWith(
      TenantId.parse(erasedSnapshot.id),
      'unit-test-salt-32-chars-padding-aaaa',
    );
  });

  it('listScheduled delegates to repo', async () => {
    const repo = buildRepoMock();
    repo.listScheduledForErasure = vi.fn().mockResolvedValue([]);
    const service = new OffboardTenantService(repo, baseEnv());
    const result = await service.listScheduled();
    expect(result).toEqual([]);
    expect(repo.listScheduledForErasure).toHaveBeenCalledTimes(1);
  });

  it('executeErasure throws when AUDIT_ERASURE_SALT is unset', async () => {
    const tenant = Tenant.provision(baseProvisionInput());
    tenant.scheduleOffboarding('user-abc', new Date('2026-06-01T10:00:00Z'));
    tenant.executeErasure(new Date('2026-07-02T10:00:00Z'));
    const repo = buildRepoMock();
    repo.eraseTenant = vi.fn().mockResolvedValue(tenant.toSnapshot());
    // baseEnv() sets AUDIT_ERASURE_SALT — override to undefined to simulate
    // a schema regression where the env var is missing.
    const envWithoutSalt = baseEnv({ AUDIT_ERASURE_SALT: undefined as unknown as string });
    const service = new OffboardTenantService(repo, envWithoutSalt);
    await expect(service.executeErasure({ tenantId: tenant.toSnapshot().id })).rejects.toThrow(
      /AUDIT_ERASURE_SALT/,
    );
    expect(repo.eraseTenant).not.toHaveBeenCalled();
  });
});
