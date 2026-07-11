import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from './ports/member-location-scope-reader.port';

export interface ListMemberLocationRolesInput {
  readonly organizationId: TenantId;
  readonly memberId: string;
}

export interface MemberLocationRoleView {
  readonly locationId: string;
  readonly role: string;
}

@Injectable()
export class ListMemberLocationRolesService {
  constructor(
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly reader: MemberLocationScopeReader,
  ) {}

  execute(input: ListMemberLocationRolesInput): Promise<readonly MemberLocationRoleView[]> {
    return this.reader.listLocationRolesForMember({
      memberId: input.memberId,
      tenantId: input.organizationId,
    });
  }
}
