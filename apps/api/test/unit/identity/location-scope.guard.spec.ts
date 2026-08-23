import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocationScopeGuard } from '../../../src/contexts/identity/interfaces/http/guards/location-scope.guard';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

vi.mock('@resto/db', () => ({
  getLocationId: vi.fn(),
}));

import { getLocationId } from '@resto/db';
const mockGetLocationId = vi.mocked(getLocationId);

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const LOCATION_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_LOCATION_ID = '33333333-3333-3333-3333-333333333333';

const operator = (over: Partial<Extract<Principal, { kind: 'operator' }>> = {}) => ({
  kind: 'operator' as const,
  userId: 'u1',
  email: 'op@example.com',
  tenantId: TENANT_ID,
  baseRole: 'staff' as const,
  ...over,
});

const buildContext = (req: {
  principal?: Principal;
  activeLocationId?: string | null;
}): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const buildGuard = (
  options: {
    locationNeutral?: boolean;
    scope?: readonly string[] | null;
  } = {},
) => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    () => options.locationNeutral ?? false,
  );
  const reader: MemberLocationScopeReader = {
    findLocationScopeForMember: vi.fn().mockResolvedValue(options.scope ?? null),
    findRoleForMemberAtLocation: vi.fn().mockResolvedValue(null),
    findPinnableLocations: vi.fn().mockResolvedValue([]),
    listLocationRolesForMember: vi.fn().mockResolvedValue([]),
  };
  return { guard: new LocationScopeGuard(reflector, reader), reader };
};

describe('LocationScopeGuard', () => {
  describe('@LocationNeutral opt-out', () => {
    it('passes when the route is @LocationNeutral (opt-out)', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: true });
      await expect(guard.canActivate(buildContext({ principal: operator() }))).resolves.toBe(true);
    });
  });

  describe('default-on (no @LocationNeutral)', () => {
    it('rejects with location.context_required when no location is bound to ALS', async () => {
      mockGetLocationId.mockReturnValue(undefined);
      const { guard } = buildGuard({ locationNeutral: false });
      await expect(
        guard.canActivate(buildContext({ principal: operator() })),
      ).rejects.toMatchObject({ response: { code: 'location.context_required' } });
    });

    it('rejects with location.operator_required for anonymous principal', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false });
      await expect(
        guard.canActivate(buildContext({ principal: { kind: 'anonymous' } })),
      ).rejects.toMatchObject({ response: { code: 'location.operator_required' } });
    });

    it('rejects when the operator has no tenantId on the principal', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false });
      const { tenantId: _omit, ...operatorWithoutTenant } = operator();
      await expect(
        guard.canActivate(
          buildContext({ principal: operatorWithoutTenant, activeLocationId: LOCATION_ID }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('owner bypass', () => {
    it('passes for owner regardless of activeLocationId', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard, reader } = buildGuard({ locationNeutral: false, scope: null });
      await expect(
        guard.canActivate(
          buildContext({ principal: operator({ baseRole: 'owner' }), activeLocationId: null }),
        ),
      ).resolves.toBe(true);
      expect(reader.findLocationScopeForMember).not.toHaveBeenCalled();
    });

    it('passes for owner even when location != activeLocationId pin', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard, reader } = buildGuard({ locationNeutral: false, scope: [OTHER_LOCATION_ID] });
      await expect(
        guard.canActivate(
          buildContext({
            principal: operator({ baseRole: 'owner' }),
            activeLocationId: OTHER_LOCATION_ID,
          }),
        ),
      ).resolves.toBe(true);
      expect(reader.findLocationScopeForMember).not.toHaveBeenCalled();
    });
  });

  describe('session-vs-request reconciliation (non-owner)', () => {
    it('throws NotFoundException for non-owner with null activeLocationId', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false, scope: [LOCATION_ID] });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeLocationId: null })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for non-owner when ALS location != session pin', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false, scope: [LOCATION_ID] });
      await expect(
        guard.canActivate(
          buildContext({ principal: operator(), activeLocationId: OTHER_LOCATION_ID }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('scope-denied (non-owner)', () => {
    it('rejects with location.access_denied for non-owner when scope is empty', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false, scope: null });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeLocationId: LOCATION_ID })),
      ).rejects.toMatchObject({ response: { code: 'location.access_denied' } });
    });

    it('rejects with location.access_denied when location is not in scope', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({ locationNeutral: false, scope: [OTHER_LOCATION_ID] });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeLocationId: LOCATION_ID })),
      ).rejects.toMatchObject({ response: { code: 'location.access_denied' } });
    });

    it('passes for non-owner when location is in scope AND pin matches', async () => {
      mockGetLocationId.mockReturnValue(LOCATION_ID);
      const { guard } = buildGuard({
        locationNeutral: false,
        scope: [LOCATION_ID, OTHER_LOCATION_ID],
      });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeLocationId: LOCATION_ID })),
      ).resolves.toBe(true);
    });
  });
});
