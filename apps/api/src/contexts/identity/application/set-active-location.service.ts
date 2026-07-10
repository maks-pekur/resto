import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { LocationAlreadyPinnedError, LocationOutOfScopeError } from '../domain/errors';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from './ports/member-location-scope-reader.port';
import {
  SESSION_ACTIVE_LOCATION_WRITER,
  type SessionActiveLocationWriter,
} from './ports/session-active-location-writer.port';

export interface SetActiveLocationInput {
  readonly userId: string;
  readonly tenantId: TenantId;
  readonly baseRole: string | undefined;
  readonly brandId: string;
  readonly locationId: string | null;
  readonly sessionToken: string;
}

export interface SetActiveLocationResult {
  readonly locationId: string | null;
}

@Injectable()
export class SetActiveLocationService {
  constructor(
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly scopeReader: MemberLocationScopeReader,
    @Inject(SESSION_ACTIVE_LOCATION_WRITER) private readonly writer: SessionActiveLocationWriter,
  ) {}

  async execute(input: SetActiveLocationInput): Promise<SetActiveLocationResult> {
    if (input.baseRole === 'owner') {
      if (input.locationId === null) {
        await this.writer.writeActiveLocation({
          sessionToken: input.sessionToken,
          activeLocationId: null,
        });
        return { locationId: null };
      }
      const candidates = await this.scopeReader.findPinnableLocations({
        userId: input.userId,
        tenantId: input.tenantId,
        brandId: input.brandId,
        isOwner: true,
      });
      const match = candidates.find((l) => l.id === input.locationId);
      if (!match) throw new LocationOutOfScopeError();
      await this.writer.writeActiveLocation({
        sessionToken: input.sessionToken,
        activeLocationId: input.locationId,
      });
      return { locationId: input.locationId };
    }

    const current = await this.writer.readActiveLocationId(input.sessionToken);
    if (current !== null) {
      throw new LocationAlreadyPinnedError();
    }
    const scope = await this.scopeReader.findLocationScopeForMember({
      userId: input.userId,
      tenantId: input.tenantId,
    });
    if (input.locationId === null || !scope?.includes(input.locationId)) {
      throw new LocationOutOfScopeError();
    }
    await this.writer.writeActiveLocation({
      sessionToken: input.sessionToken,
      activeLocationId: input.locationId,
    });
    return { locationId: input.locationId };
  }
}
