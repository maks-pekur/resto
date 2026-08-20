import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TenantId } from '@resto/domain';
import { ListMemberLocationRolesService } from '../../../src/contexts/identity/application/list-member-location-roles.service';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';

const ORG_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const MEMBER_ID = 'member-target';
const LOCATION_ID = '00000000-0000-0000-0000-000000000002';

const makeReader = (
  overrides: Partial<MemberLocationScopeReader> = {},
): MemberLocationScopeReader => ({
  findLocationScopeForMember: vi.fn().mockResolvedValue(null),
  findRoleForMemberAtLocation: vi.fn().mockResolvedValue(null),
  findPinnableLocations: vi.fn().mockResolvedValue([]),
  listLocationRolesForMember: vi.fn().mockResolvedValue([]),
  ...overrides,
});

describe('ListMemberLocationRolesService', () => {
  it('delegates to the reader with organizationId mapped to tenantId', async () => {
    const listLocationRolesForMember = vi
      .fn()
      .mockResolvedValue([{ locationId: LOCATION_ID, role: 'cashier' }]);
    const reader = makeReader({ listLocationRolesForMember });
    const svc = new ListMemberLocationRolesService(reader);

    const result = await svc.execute({ organizationId: ORG_ID, memberId: MEMBER_ID });

    expect(listLocationRolesForMember).toHaveBeenCalledWith({
      memberId: MEMBER_ID,
      tenantId: ORG_ID,
    });
    expect(result).toEqual([{ locationId: LOCATION_ID, role: 'cashier' }]);
  });

  it('returns an empty array when the member has no location-role pairs', async () => {
    const reader = makeReader({ listLocationRolesForMember: vi.fn().mockResolvedValue([]) });
    const svc = new ListMemberLocationRolesService(reader);

    const result = await svc.execute({ organizationId: ORG_ID, memberId: MEMBER_ID });

    expect(result).toEqual([]);
  });
});
