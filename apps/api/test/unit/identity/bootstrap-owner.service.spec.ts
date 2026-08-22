import { describe, expect, it, vi } from 'vitest';
import { BootstrapOwnerService } from '../../../src/contexts/identity/application/bootstrap-owner.service';
import type { TenantLookupPort } from '../../../src/contexts/identity/application/ports/tenant-lookup.port';
import type { BaUserReader } from '../../../src/contexts/identity/application/ports/ba-user-reader.port';

const makeTenantLookup = (
  result: { id: string; slug: string; displayName: string } | null,
): TenantLookupPort => ({
  findBySlug: vi.fn().mockResolvedValue(result),
  findById: vi.fn().mockResolvedValue(result),
});

const makeAuth = () => ({
  api: {
    signUpEmail: vi.fn().mockResolvedValue({ user: { id: 'user-uuid', email: 'ops@demo.test' } }),
    addMember: vi.fn().mockResolvedValue({ id: 'member-uuid', userId: 'user-uuid', role: 'owner' }),
  },
});

const makeUsers = (
  existingOwner: { id: string; email: string } | null = null,
  existingUser: { id: string; email: string } | null = null,
): BaUserReader => ({
  findOwnerByTenant: vi.fn().mockResolvedValue(existingOwner),
  findUserByEmail: vi.fn().mockResolvedValue(existingUser),
});

describe('BootstrapOwnerService — happy path', () => {
  it('creates user and owner member against the existing tenant org', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    // No existing owner, no existing user → full signup + addMember path.
    const svc = new BootstrapOwnerService(lookup, auth as never, makeUsers(null, null));

    const result = await svc.execute({
      tenantSlug: 'demo',
      email: 'OPS@Demo.Test',
      password: 'pw-12345678901234567890',
      name: 'Demo Owner',
    });

    expect(result).toEqual({
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
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

    // Member is added with the owner role, scoped to the tenant id from
    // the lookup (NOT from a BA call — BA's `organization` is `tenants`).
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
    const svc = new BootstrapOwnerService(lookup, auth as never, makeUsers(null, null));

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
    expect(auth.api.addMember).not.toHaveBeenCalled();
  });
});

describe('BootstrapOwnerService — idempotency', () => {
  it('returns existing owner when same email is already an owner (no-op re-run)', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    // existingOwner matches the requested email → pure no-op.
    const users = makeUsers({ id: 'user-uuid', email: 'ops@demo.test' }, null);
    const svc = new BootstrapOwnerService(lookup, auth as never, users);

    const result = await svc.execute({
      tenantSlug: 'demo',
      email: 'OPS@Demo.Test',
      password: 'pw-12345678901234567890',
      name: 'Demo Owner',
    });

    expect(result).toEqual({
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
      email: 'ops@demo.test',
      requiresPasswordChange: false,
    });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(auth.api.addMember).not.toHaveBeenCalled();
  });

  it('compares emails case-insensitively even when the stored value is mixed-case', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    // Both stored and input are non-canonical to prove BOTH sides are
    // normalized before comparison (RES-109 testing review §14).
    const users = makeUsers({ id: 'user-uuid', email: 'Ops@Demo.Test' }, null);
    const svc = new BootstrapOwnerService(lookup, auth as never, users);

    const result = await svc.execute({
      tenantSlug: 'demo',
      email: 'OPS@DEMO.TEST',
      password: 'pw-12345678901234567890',
      name: 'Demo Owner',
    });

    expect(result.email).toBe('ops@demo.test');
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(auth.api.addMember).not.toHaveBeenCalled();
  });

  it('throws OwnerAlreadyExistsError when a different email is the owner', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    // existingOwner has a different email → conflict.
    const users = makeUsers({ id: 'someone-else', email: 'other@demo.test' }, null);
    const svc = new BootstrapOwnerService(lookup, auth as never, users);

    await expect(
      svc.execute({
        tenantSlug: 'demo',
        email: 'ops@demo.test',
        password: 'pw-12345678901234567890',
        name: 'Demo Owner',
      }),
    ).rejects.toMatchObject({
      name: 'OwnerAlreadyExistsError',
      code: 'owner_already_exists',
      tenantId: 'tenant-uuid',
      existingEmail: 'other@demo.test',
    });

    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(auth.api.addMember).not.toHaveBeenCalled();
  });

  it('reuses existing user (skips signUpEmail) when user table already has the email', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    // No existing owner member, but the BA user row already exists.
    const users = makeUsers(null, { id: 'existing-user', email: 'ops@demo.test' });
    const svc = new BootstrapOwnerService(lookup, auth as never, users);

    const result = await svc.execute({
      tenantSlug: 'demo',
      email: 'ops@demo.test',
      password: 'pw-12345678901234567890',
      name: 'Demo Owner',
    });

    expect(result.userId).toBe('existing-user');
    expect(result.requiresPasswordChange).toBe(true);
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(auth.api.addMember).toHaveBeenCalledOnce();
    expect(auth.api.addMember).toHaveBeenCalledWith({
      body: {
        userId: 'existing-user',
        organizationId: 'tenant-uuid',
        role: 'owner',
      },
    });
  });
});
