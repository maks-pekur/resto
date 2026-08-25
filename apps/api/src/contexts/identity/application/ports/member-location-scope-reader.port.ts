import type { TenantId } from '@resto/domain';

export const MEMBER_LOCATION_SCOPE_READER = Symbol('MEMBER_LOCATION_SCOPE_READER');

export interface PinnableLocation {
  readonly id: string;
  readonly name: string;
  /** The location's address in the admin URL — every caller needs it to build or read a link. */
  readonly slug: string;
}

export interface MemberLocationScopeReader {
  findLocationScopeForMember(input: {
    userId: string;
    tenantId: TenantId;
  }): Promise<readonly string[] | null>;
  findRoleForMemberAtLocation(input: {
    userId: string;
    locationId: string;
  }): Promise<string | null>;
  findPinnableLocations(input: {
    userId: string;
    tenantId: TenantId;
    isOwner: boolean;
  }): Promise<readonly PinnableLocation[]>;
  listLocationRolesForMember(input: {
    memberId: string;
    tenantId: TenantId;
  }): Promise<readonly { locationId: string; role: string }[]>;
}
