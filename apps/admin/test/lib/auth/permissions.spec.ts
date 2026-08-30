import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import {
  ForbiddenRouteError,
  hasPermission,
  isForbiddenRouteError,
  requirePermission,
} from '@/lib/auth/permissions';
import type { MeResponse } from '@/lib/queries/identity';

const operator = (over: Partial<MeResponse> = {}): MeResponse => ({
  kind: 'operator',
  userId: 'u1',
  email: 'someone@demo.local',
  ...over,
});

const clientReturning = (me: MeResponse | null): QueryClient =>
  ({
    ensureQueryData: vi.fn(() => Promise.resolve({ status: 200, ok: true, data: me })),
  }) as unknown as QueryClient;

describe('hasPermission', () => {
  it('grants the owner everything without reading the permissions map', () => {
    expect(hasPermission(operator({ baseRole: 'owner' }), 'ac', 'read')).toBe(true);
  });

  it('grants a non-owner an action their role lists', () => {
    const me = operator({ baseRole: 'staff', permissions: { order: ['read', 'update-status'] } });
    expect(hasPermission(me, 'order', 'read')).toBe(true);
  });

  it('refuses an action the role does not list on a resource it holds', () => {
    const me = operator({ baseRole: 'staff', permissions: { menu: ['read'] } });
    expect(hasPermission(me, 'menu', 'update')).toBe(false);
  });

  it('refuses a resource the role does not hold at all', () => {
    const me = operator({ baseRole: 'staff', permissions: { order: ['read'] } });
    expect(hasPermission(me, 'billing', 'read')).toBe(false);
  });

  it('refuses when there is no operator', () => {
    expect(hasPermission(null, 'order', 'read')).toBe(false);
  });
});

describe('requirePermission', () => {
  it('resolves when the operator holds the permission', async () => {
    const guard = requirePermission('order', 'read');
    const queryClient = clientReturning(operator({ permissions: { order: ['read'] } }));

    await expect(guard({ context: { queryClient } })).resolves.toBeUndefined();
  });

  it('throws ForbiddenRouteError naming the missing permission', async () => {
    const guard = requirePermission('ac', 'read');
    const queryClient = clientReturning(operator({ permissions: { order: ['read'] } }));

    await expect(guard({ context: { queryClient } })).rejects.toThrow(ForbiddenRouteError);
    await guard({ context: { queryClient } }).catch((err: unknown) => {
      expect(isForbiddenRouteError(err)).toBe(true);
      expect((err as ForbiddenRouteError).required).toEqual({ resource: 'ac', action: 'read' });
    });
  });

  it('refuses when /v1/me returns no operator', async () => {
    const guard = requirePermission('order', 'read');
    await expect(guard({ context: { queryClient: clientReturning(null) } })).rejects.toThrow(
      ForbiddenRouteError,
    );
  });

  it('carries the required permission so the route-tree spec can enumerate guards', () => {
    expect(requirePermission('settings', 'update').permission).toEqual({
      resource: 'settings',
      action: 'update',
    });
  });
});

describe('isForbiddenRouteError', () => {
  it('does not mistake an ordinary failure for a refusal', () => {
    expect(isForbiddenRouteError(new Error('network down'))).toBe(false);
  });
});
