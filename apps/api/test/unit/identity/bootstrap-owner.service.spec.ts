import { describe, expect, it, vi } from 'vitest';
import { BootstrapOwnerService } from '../../../src/contexts/identity/application/bootstrap-owner.service';
import type { TenantLookupPort } from '../../../src/contexts/identity/application/ports/tenant-lookup.port';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const makeTenantLookup = (
  result: { id: string; slug: string; displayName: string } | null,
): TenantLookupPort => ({
  findBySlug: vi.fn().mockResolvedValue(result),
});

/**
 * Mocks the BA admin API surface used by the service:
 *   - signUpEmail (top-level user creation)
 *   - addMember (organization plugin, SERVER_ONLY)
 *   - listMembers (organization plugin) — idempotency probe; defaults to
 *     "no members" so the happy-path test remains untouched.
 *
 * `createOrganization` is intentionally NOT mocked: BA's `organization`
 * is physically the `tenants` table, so the tenant row created by the
 * provisioning flow already IS the BA organization. The service must
 * never call `createOrganization` — it would collide on the slug unique
 * or duplicate the tenant row.
 */
const makeAuth = () => ({
  api: {
    signUpEmail: vi.fn().mockResolvedValue({ user: { id: 'user-uuid', email: 'ops@demo.test' } }),
    addMember: vi.fn().mockResolvedValue({ id: 'member-uuid', userId: 'user-uuid', role: 'owner' }),
    listMembers: vi.fn().mockResolvedValue({ members: [], total: 0 }),
  },
});

/**
 * Stub for the AuthDrizzle pool. The service only ever calls the chain
 * `db.select(...).from(...).where(...).limit(...)` from `findUserByEmail`,
 * so we satisfy that exact shape and ignore the rest of Drizzle's surface.
 */
const makeAuthDb = (user: { id: string; email: string } | null = null): AuthDrizzle =>
  ({
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(user ? [user] : []),
          }),
        }),
      }),
    },
    client: {} as never,
  }) as unknown as AuthDrizzle;

describe('BootstrapOwnerService — happy path', () => {
  it('creates user and owner member against the existing tenant org', async () => {
    const lookup = makeTenantLookup({
      id: 'tenant-uuid',
      slug: 'demo',
      displayName: 'Demo',
    });
    const auth = makeAuth();
    const svc = new BootstrapOwnerService(lookup, auth as never, makeAuthDb());

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

    // Idempotency probe ran first, scoped to the tenant id.
    expect(auth.api.listMembers).toHaveBeenCalledOnce();
    expect(auth.api.listMembers).toHaveBeenCalledWith({
      query: { organizationId: 'tenant-uuid' },
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
    const svc = new BootstrapOwnerService(lookup, auth as never, makeAuthDb());

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

    expect(auth.api.listMembers).not.toHaveBeenCalled();
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
    auth.api.listMembers = vi.fn().mockResolvedValue({
      members: [
        {
          id: 'm1',
          role: 'owner',
          user: { id: 'user-uuid', email: 'ops@demo.test' },
        },
      ],
      total: 1,
    });
    const svc = new BootstrapOwnerService(lookup, auth as never, makeAuthDb());

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
      requiresPasswordChange: false,
    });
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
    auth.api.listMembers = vi.fn().mockResolvedValue({
      members: [
        {
          id: 'm1',
          role: 'owner',
          user: { id: 'someone-else', email: 'other@demo.test' },
        },
      ],
      total: 1,
    });
    const svc = new BootstrapOwnerService(lookup, auth as never, makeAuthDb());

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
    const authDb = makeAuthDb({ id: 'existing-user', email: 'ops@demo.test' });
    const svc = new BootstrapOwnerService(lookup, auth as never, authDb);

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
