import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../../src/contexts/identity/domain/principal';
import { ROLES_KEY } from '../../../src/contexts/identity/interfaces/http/roles.decorator';
import { REQUIRES_LOCATION_KEY } from '../../../src/contexts/identity/interfaces/http/requires-location.decorator';
import { RolesGuard } from '../../../src/contexts/identity/interfaces/http/roles.guard';

const buildContext = (
  principal: Principal | undefined,
  params: Record<string, string> = {},
): ExecutionContext => {
  const request = { principal, params };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
};

const stubReflector = (metadata: Record<string, unknown>): Reflector =>
  ({
    getAllAndOverride: (key: string): unknown => metadata[key],
  }) as unknown as Reflector;

const principal: Principal = {
  subject: 'kc-sub-123',
  tenantId: '11111111-1111-4111-8111-111111111111',
  roles: ['manager'],
};

describe('RolesGuard.canActivate', () => {
  it('returns true when no role / location requirement is set', () => {
    const guard = new RolesGuard(stubReflector({}));
    expect(guard.canActivate(buildContext(principal))).toBe(true);
  });

  it('throws Unauthorized when no principal is attached', () => {
    const guard = new RolesGuard(stubReflector({ [ROLES_KEY]: ['owner'] }));
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(UnauthorizedException);
  });

  it('returns true when the principal carries one of the required roles', () => {
    const guard = new RolesGuard(stubReflector({ [ROLES_KEY]: ['owner', 'manager'] }));
    expect(guard.canActivate(buildContext(principal))).toBe(true);
  });

  it('throws Forbidden when the principal lacks every required role', () => {
    const guard = new RolesGuard(stubReflector({ [ROLES_KEY]: ['owner'] }));
    expect(() => guard.canActivate(buildContext(principal))).toThrow(ForbiddenException);
  });

  it('enforces location scoping when @RequiresLocation is set', () => {
    const guard = new RolesGuard(
      stubReflector({
        [ROLES_KEY]: ['manager'],
        [REQUIRES_LOCATION_KEY]: 'locationId',
      }),
    );
    const scopedPrincipal: Principal = { ...principal, locations: ['loc-a'] };
    expect(guard.canActivate(buildContext(scopedPrincipal, { locationId: 'loc-a' }))).toBe(true);
    expect(() => guard.canActivate(buildContext(scopedPrincipal, { locationId: 'loc-b' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the route requires a location but none is supplied', () => {
    const guard = new RolesGuard(
      stubReflector({
        [REQUIRES_LOCATION_KEY]: 'locationId',
      }),
    );
    expect(() => guard.canActivate(buildContext(principal, {}))).toThrow(ForbiddenException);
  });
});
