import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import {
  AuthGuard,
  buildPrincipal,
} from '../../../src/contexts/identity/interfaces/http/guards/auth.guard';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '../../../src/shared/auth';

const mockGetTenantContext = vi.fn<() => { tenantId: string } | undefined>();
vi.mock('@resto/db', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTenantContext: (): { tenantId: string } | undefined => mockGetTenantContext(),
}));

type Membership = { role: 'owner' | 'admin' | 'staff' | undefined } | null;

const session = (
  over: { phoneNumber?: string | null; activeOrganizationId?: string | null } = {},
) => ({
  user: {
    id: 'user-1',
    email: 'someone@example.com',
    phoneNumber: over.phoneNumber ?? null,
  },
  session: {
    activeOrganizationId: over.activeOrganizationId ?? null,
    token: 'token-1',
  },
});

const build = (
  s: ReturnType<typeof session>,
  alsTenantId: string | undefined,
  membership: Membership,
) => buildPrincipal(s, alsTenantId, membership);

describe('buildPrincipal — on a guest host, membership decides', () => {
  it('a member of this tenant is an operator, taking their tenant from the session and not the host', () => {
    const p = build(session({ activeOrganizationId: 't1' }), 't1', { role: 'owner' });
    expect(p.kind).toBe('operator');
    expect(p).toMatchObject({ tenantId: 't1', baseRole: 'owner' });
  });

  it('a member with only a custom role is still an operator, without a base role', () => {
    const p = build(session({ activeOrganizationId: 't1' }), 't1', { role: undefined });
    expect(p.kind).toBe('operator');
    expect(p).toMatchObject({ tenantId: 't1' });
    expect((p as { baseRole?: unknown }).baseRole).toBeUndefined();
  });

  it('someone with no membership here is a customer, even with no phone number', () => {
    const p = build(session(), 't1', null);
    expect(p.kind).toBe('customer');
    expect(p).toMatchObject({ tenantId: 't1', userId: 'user-1', phone: null });
  });

  it('a phone customer with no membership stays a customer', () => {
    const p = build(session({ phoneNumber: '+100000001' }), 't1', null);
    expect(p.kind).toBe('customer');
    expect(p).toMatchObject({ tenantId: 't1', phone: '+100000001' });
  });

  it('a phone number still wins over a membership — 07.4 settled this and 10.7 does not reopen it', () => {
    const p = build(session({ phoneNumber: '+100000001' }), 't1', { role: 'staff' });
    expect(p.kind).toBe('customer');
    expect(p).toMatchObject({ tenantId: 't1', phone: '+100000001' });
  });

  it('an operator bound elsewhere is not turned into a guest by visiting another restaurant', () => {
    const p = build(session({ activeOrganizationId: 't-other' }), 't1', null);
    expect(p.kind).toBe('operator');
    expect(p).toMatchObject({ tenantId: 't-other' });
  });
});

describe('buildPrincipal — off a guest host, onboarding must keep working', () => {
  it('a signed-in person with no membership anywhere is an operator, so they can create their first restaurant', () => {
    const p = build(session(), undefined, null);
    expect(p.kind).toBe('operator');
    expect((p as { tenantId?: unknown }).tenantId).toBeUndefined();
  });

  it('a signed-in member off a tenant host takes their tenant from the session', () => {
    const p = build(session({ activeOrganizationId: 't1' }), undefined, { role: 'owner' });
    expect(p.kind).toBe('operator');
    expect(p).toMatchObject({ tenantId: 't1' });
  });

  it('a phone holder off a tenant host is anonymous', () => {
    const p = build(session({ phoneNumber: '+100000001' }), undefined, null);
    expect(p.kind).toBe('anonymous');
  });
});

describe('@OptionalAuth — a public route may learn who you are, and never refuses', () => {
  const buildGuard = (getSession: () => Promise<unknown>, memberRows: unknown[] = []) => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === IS_PUBLIC_KEY || key === OPTIONAL_AUTH_KEY ? true : undefined,
    );
    const auth = { api: { getSession: vi.fn(getSession) } };
    const authDb = {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(memberRows) }),
          }),
        }),
      },
    };
    const lookup = {
      findBySlug: vi.fn().mockResolvedValue(null),
      findById: vi
        .fn()
        .mockResolvedValue({ id: 't1', slug: 'd', displayName: 'D', archivedAt: null }),
    };
    return new AuthGuard(reflector, auth as never, lookup, authDb as never);
  };

  const ctxFor = (req: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as never;

  it('serves an anonymous visitor rather than refusing them', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't1' });
    const req: Record<string, unknown> = { headers: {}, url: '/v1/orders' };
    await expect(buildGuard(() => Promise.resolve(null)).canActivate(ctxFor(req))).resolves.toBe(
      true,
    );
    expect(req.principal).toMatchObject({ kind: 'anonymous' });
  });

  it('gives a signed-in guest a customer principal', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't1' });
    const req: Record<string, unknown> = { headers: {}, url: '/v1/orders' };
    const guard = buildGuard(() =>
      Promise.resolve({
        user: { id: 'g1', email: 'guest@example.com', phoneNumber: null },
        session: { activeOrganizationId: null, token: 'tok' },
      }),
    );
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.principal).toMatchObject({ kind: 'customer', userId: 'g1', tenantId: 't1' });
  });

  it('treats a broken session as anonymous instead of throwing — a lapsed cookie must not block an order', async () => {
    mockGetTenantContext.mockReturnValue({ tenantId: 't1' });
    const req: Record<string, unknown> = { headers: {}, url: '/v1/orders' };
    const guard = buildGuard(() => Promise.reject(new Error('session store unavailable')));
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.principal).toMatchObject({ kind: 'anonymous' });
  });
});
