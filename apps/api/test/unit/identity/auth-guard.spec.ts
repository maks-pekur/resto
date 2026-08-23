import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../../src/contexts/identity/interfaces/http/guards/auth.guard';
import type { TenantLookupPort } from '../../../src/contexts/identity/application/ports/tenant-lookup.port';

// Mock @resto/db so we can control getTenantContext() per-test.
// The guard calls getTenantContext() from ALS — no req field is used.
vi.mock('@resto/db', () => ({
  getTenantContext: vi.fn(),
}));

import { getTenantContext } from '@resto/db';
const mockGetTenantContext = vi.mocked(getTenantContext);

const buildContext = (req: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const buildAuthStub = (
  sessionResult: unknown,
): { api: { getSession: ReturnType<typeof vi.fn> } } => ({
  api: { getSession: vi.fn().mockResolvedValue(sessionResult) },
});

const buildLookupStub = (archivedAt: Date | null = null): TenantLookupPort => ({
  findBySlug: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue({
    id: 'tenant-1',
    slug: 'tenant-1',
    displayName: 'Tenant 1',
    archivedAt,
  }),
});

const authDb = {
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: 'owner' }]),
        }),
      }),
    }),
  },
};

describe('AuthGuard', () => {
  it('skips when @Public metadata is set', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const auth = buildAuthStub(null);
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const ctx = buildContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when no session and not public', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub(null);
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const ctx = buildContext({ headers: {}, url: '/v1/me' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches OperatorPrincipal when BA returns email-based session', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub({
      user: { id: 'u1', email: 'op@example.com', phoneNumber: null },
      session: { activeOrganizationId: 't-1' },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const req = { headers: {}, url: '/v1/me' } as Record<string, unknown>;
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.principal).toMatchObject({
      kind: 'operator',
      userId: 'u1',
      email: 'op@example.com',
      tenantId: 't-1',
    });
  });

  it('attaches OperatorPrincipal without tenantId when no active org', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub({
      user: { id: 'u2', email: 'op2@example.com', phoneNumber: null },
      session: { activeOrganizationId: null },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const req = { headers: {}, url: '/v1/me' } as Record<string, unknown>;
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.principal).toMatchObject({ kind: 'operator', userId: 'u2' });
    expect(req.principal).not.toHaveProperty('tenantId');
  });

  it('attaches CustomerPrincipal when BA user has phoneNumber', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't-host' });
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub({
      user: { id: 'u3', email: 'fake@phone.local', phoneNumber: '+380000000000' },
      session: { activeOrganizationId: null },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const req = { headers: {}, url: '/v1/me' } as Record<string, unknown>;
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.principal).toMatchObject({
      kind: 'customer',
      userId: 'u3',
      phone: '+380000000000',
      tenantId: 't-host',
    });
  });

  it('falls back to AnonymousPrincipal when customer session has no ALS tenant (RES-201)', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub({
      user: { id: 'u4', email: 'fake@phone.local', phoneNumber: '+380111111111' },
      session: { activeOrganizationId: null },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const req = { headers: {}, url: '/v1/me' } as Record<string, unknown>;
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.principal).toEqual({ kind: 'anonymous' });
  });

  it('throws Forbidden when principal.tenantId mismatches ALS tenantId', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't-OTHER' });
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub({
      user: { id: 'u1', email: 'op@example.com', phoneNumber: null },
      session: { activeOrganizationId: 't-1' },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const req = { headers: {}, url: '/v1/me' } as Record<string, unknown>;
    const ctx = buildContext(req);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects with auth.tenant_context_missing when @RequiresTenantContext route has no ALS tenant (RES-172)', async () => {
    mockGetTenantContext.mockReturnValue(undefined);
    const reflector = new Reflector();
    // First lookup → IS_PUBLIC_KEY (false), second → REQUIRES_TENANT_CONTEXT_KEY (true)
    vi.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(true);
    const auth = buildAuthStub({
      user: { id: 'u1', email: 'op@example.com', phoneNumber: null },
      session: { activeOrganizationId: null },
    });
    const lookup = buildLookupStub();
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const ctx = buildContext({ headers: {}, url: '/v1/me/tenants' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { code: 'auth.tenant_context_missing' },
    });
  });

  it('rejects every request when the resolved tenant is archived (RES-127)', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 'tenant-archived-uuid' });
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const auth = buildAuthStub(null);
    const lookup: TenantLookupPort = {
      findBySlug: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-archived-uuid',
        slug: 'tenant-archived',
        displayName: 'Tenant Archived',
        archivedAt: new Date('2026-05-07T00:00:00Z'),
      }),
    };
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const ctx = buildContext({ headers: {}, url: '/v1/me' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { code: 'tenant.archived' },
    });
  });

  it('returns 404 (not 403) for an archived tenant on a @Public route, hiding existence', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 'tenant-archived-uuid' });
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const auth = buildAuthStub(null);
    const lookup: TenantLookupPort = {
      findBySlug: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue({
        id: 'tenant-archived-uuid',
        slug: 'tenant-archived',
        displayName: 'Tenant Archived',
        archivedAt: new Date('2026-05-07T00:00:00Z'),
      }),
    };
    const guard = new AuthGuard(reflector, auth as never, lookup, authDb as never);
    const ctx = buildContext({ headers: {}, url: '/v1/menu' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AuthGuard.lookupBaseRole (D-15 CSV parsing)', () => {
  const buildGuardWithRole = (roleValue: string | undefined) => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const limitMock = vi.fn().mockResolvedValue(roleValue ? [{ role: roleValue }] : []);
    const db = {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: limitMock }),
          }),
        }),
      },
    };
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: 'u1', email: 'op@example.com', phoneNumber: null },
          session: { activeOrganizationId: 't-1', token: 'tok' },
        }),
      },
    };
    const lookup: TenantLookupPort = {
      findBySlug: vi.fn().mockResolvedValue(null),
      findById: vi
        .fn()
        .mockResolvedValue({ id: 't-1', slug: 'demo', displayName: 'D', archivedAt: null }),
    };
    return { guard: new AuthGuard(reflector, auth as never, lookup, db as never) };
  };

  it("resolves 'staff' from CSV 'staff,gm'", async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't-1' });
    const { guard } = buildGuardWithRole('staff,gm');
    const req = { headers: {}, url: '/v1/roles' } as Record<string, unknown>;
    await guard.canActivate(buildContext(req));
    expect((req.principal as { baseRole?: string }).baseRole).toBe('staff');
  });

  it("resolves 'admin' from plain 'admin'", async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't-1' });
    const { guard } = buildGuardWithRole('admin');
    const req = { headers: {}, url: '/v1/roles' } as Record<string, unknown>;
    await guard.canActivate(buildContext(req));
    expect((req.principal as { baseRole?: string }).baseRole).toBe('admin');
  });

  it('returns undefined baseRole for a custom-only slug', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't-1' });
    const { guard } = buildGuardWithRole('custom-manager');
    const req = { headers: {}, url: '/v1/roles' } as Record<string, unknown>;
    await guard.canActivate(buildContext(req));
    expect((req.principal as { baseRole?: string }).baseRole).toBeUndefined();
  });
});
