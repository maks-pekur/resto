import { describe, expect, it, vi } from 'vitest';
import { BootstrapOwnerService } from '../../../src/contexts/identity/application/bootstrap-owner.service';
import type { TenantLookupPort } from '../../../src/contexts/identity/application/ports/tenant-lookup.port';

const makeTenantLookup = (
  result: { id: string; slug: string; displayName: string } | null,
): TenantLookupPort => ({
  findBySlug: vi.fn().mockResolvedValue(result),
});

/**
 * Mocks only the BA admin API surface used by the happy path:
 *   - signUpEmail (top-level user creation)
 *   - createOrganization (organization plugin)
 *   - addMember (organization plugin, SERVER_ONLY)
 *
 * Idempotency probes (listOrganizations / listMembers / etc.) are added
 * in Task 10 — not here.
 */
const makeAuth = () => ({
  api: {
    signUpEmail: vi.fn().mockResolvedValue({ user: { id: 'user-uuid', email: 'ops@demo.test' } }),
    createOrganization: vi
      .fn()
      .mockResolvedValue({ id: 'tenant-uuid', slug: 'demo', name: 'Demo' }),
    addMember: vi.fn().mockResolvedValue({ id: 'member-uuid', userId: 'user-uuid', role: 'owner' }),
  },
});

describe('BootstrapOwnerService — happy path', () => {
  it('creates user, org, and owner member when nothing exists yet', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    const svc = new BootstrapOwnerService(lookup, auth as never);

    const result = await svc.execute({
      tenantSlug: 'demo',
      email: 'OPS@Demo.Test',
      password: 'pw-12345678901234567890',
      name: 'Demo Owner',
    });

    expect(result).toEqual({
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
      organizationId: 'tenant-uuid',
      email: 'ops@demo.test',
      requiresPasswordChange: true,
    });

    // Email is normalised before being passed to BA.
    expect(auth.api.signUpEmail).toHaveBeenCalledOnce();
    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'ops@demo.test',
        name: 'Demo Owner',
        password: 'pw-12345678901234567890',
      },
    });

    // Org is created with the tenant's slug + display name.
    expect(auth.api.createOrganization).toHaveBeenCalledOnce();
    expect(auth.api.createOrganization).toHaveBeenCalledWith({
      body: { name: 'Demo', slug: 'demo' },
    });

    // Member is added with the owner role, scoped to the org returned by BA.
    expect(auth.api.addMember).toHaveBeenCalledOnce();
    expect(auth.api.addMember).toHaveBeenCalledWith({
      body: {
        userId: 'user-uuid',
        organizationId: 'tenant-uuid',
        role: 'owner',
      },
    });
  });

  it('throws TenantNotFoundForBootstrapError when slug does not exist', async () => {
    const lookup = makeTenantLookup(null);
    const auth = makeAuth();
    const svc = new BootstrapOwnerService(lookup, auth as never);

    await expect(
      svc.execute({
        tenantSlug: 'ghost',
        email: 'ops@ghost.test',
        password: 'pw-12345678901234567890',
        name: 'Ghost Owner',
      }),
    ).rejects.toMatchObject({
      name: 'TenantNotFoundForBootstrapError',
      code: 'tenant_not_found',
      tenantSlug: 'ghost',
    });

    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(auth.api.createOrganization).not.toHaveBeenCalled();
    expect(auth.api.addMember).not.toHaveBeenCalled();
  });
});
