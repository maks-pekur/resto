import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TenantId } from '@resto/domain';
import {
  LocationAlreadyPinnedError,
  LocationOutOfScopeError,
} from '../../../src/contexts/identity/domain/errors';
import { SetActiveLocationService } from '../../../src/contexts/identity/application/location-scope/set-active-location.service';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
import type { SessionActiveLocationWriter } from '../../../src/contexts/identity/application/ports/session-active-location-writer.port';

const TENANT_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const USER_ID = '00000000-0000-0000-0000-000000000002';
const LOCATION_A = '00000000-0000-0000-0000-000000000010';
const LOCATION_B = '00000000-0000-0000-0000-000000000011';
const SESSION_TOKEN = 'session-token';

const makeReader = (
  overrides: Partial<MemberLocationScopeReader> = {},
): MemberLocationScopeReader => ({
  findLocationScopeForMember: vi.fn().mockResolvedValue(null),
  findRoleForMemberAtLocation: vi.fn().mockResolvedValue(null),
  findPinnableLocations: vi.fn().mockResolvedValue([]),
  listLocationRolesForMember: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const makeWriter = (
  overrides: Partial<SessionActiveLocationWriter> = {},
): SessionActiveLocationWriter => ({
  writeActiveLocation: vi.fn().mockResolvedValue(undefined),
  readActiveLocationId: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('SetActiveLocationService', () => {
  it('owner: set-active-location is a no-op — returns { locationId: null }, no write, no scope lookup (D-13)', async () => {
    const reader = makeReader();
    const writer = makeWriter();
    const svc = new SetActiveLocationService(reader, writer);

    const result = await svc.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      baseRole: 'owner',
      locationId: LOCATION_A,
      sessionToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ locationId: null });
    expect(writer.writeActiveLocation).not.toHaveBeenCalled();
    expect(writer.readActiveLocationId).not.toHaveBeenCalled();
    expect(reader.findPinnableLocations).not.toHaveBeenCalled();
  });

  it('owner: passing null is still a no-op — returns { locationId: null }', async () => {
    const reader = makeReader();
    const writer = makeWriter();
    const svc = new SetActiveLocationService(reader, writer);

    const result = await svc.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      baseRole: 'owner',
      locationId: null,
      sessionToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ locationId: null });
    expect(writer.writeActiveLocation).not.toHaveBeenCalled();
    expect(reader.findPinnableLocations).not.toHaveBeenCalled();
  });

  it('non-owner: throws LocationAlreadyPinnedError when session already has a non-null activeLocationId', async () => {
    const reader = makeReader({
      findLocationScopeForMember: vi.fn().mockResolvedValue([LOCATION_A]),
    });
    const writer = makeWriter({
      readActiveLocationId: vi.fn().mockResolvedValue(LOCATION_A),
    });
    const svc = new SetActiveLocationService(reader, writer);

    await expect(
      svc.execute({
        userId: USER_ID,
        tenantId: TENANT_ID,
        baseRole: 'staff',
        locationId: LOCATION_A,
        sessionToken: SESSION_TOKEN,
      }),
    ).rejects.toBeInstanceOf(LocationAlreadyPinnedError);
    expect(writer.writeActiveLocation).not.toHaveBeenCalled();
  });

  it('non-owner: writes once when session activeLocationId is null and target is in scope', async () => {
    const reader = makeReader({
      findLocationScopeForMember: vi.fn().mockResolvedValue([LOCATION_A, LOCATION_B]),
    });
    const writer = makeWriter({
      readActiveLocationId: vi.fn().mockResolvedValue(null),
    });
    const svc = new SetActiveLocationService(reader, writer);

    const result = await svc.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      baseRole: 'staff',
      locationId: LOCATION_B,
      sessionToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ locationId: LOCATION_B });
    expect(writer.writeActiveLocation).toHaveBeenCalledWith({
      sessionToken: SESSION_TOKEN,
      activeLocationId: LOCATION_B,
    });
  });

  it('non-owner: throws LocationOutOfScopeError when target is NOT in scope', async () => {
    const reader = makeReader({
      findLocationScopeForMember: vi.fn().mockResolvedValue([LOCATION_A]),
    });
    const writer = makeWriter({
      readActiveLocationId: vi.fn().mockResolvedValue(null),
    });
    const svc = new SetActiveLocationService(reader, writer);

    await expect(
      svc.execute({
        userId: USER_ID,
        tenantId: TENANT_ID,
        baseRole: 'staff',
        locationId: LOCATION_B,
        sessionToken: SESSION_TOKEN,
      }),
    ).rejects.toBeInstanceOf(LocationOutOfScopeError);
    expect(writer.writeActiveLocation).not.toHaveBeenCalled();
  });
});
