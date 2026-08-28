import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { LocationOutOfScopeError } from '../../domain/errors';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../ports/member-location-scope-reader.port';
import {
  SESSION_ACTIVE_LOCATION_WRITER,
  type SessionActiveLocationWriter,
} from '../ports/session-active-location-writer.port';

export interface SetActiveLocationInput {
  readonly userId: string;
  readonly tenantId: TenantId;
  readonly baseRole: string | undefined;
  readonly locationId: string | null;
  readonly sessionToken: string;
}

export interface SetActiveLocationResult {
  readonly locationId: string | null;
}

@Injectable()
export class SetActiveLocationService {
  private readonly logger = new Logger(SetActiveLocationService.name);

  constructor(
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly scopeReader: MemberLocationScopeReader,
    @Inject(SESSION_ACTIVE_LOCATION_WRITER) private readonly writer: SessionActiveLocationWriter,
  ) {}

  async execute(input: SetActiveLocationInput): Promise<SetActiveLocationResult> {
    if (input.baseRole === 'owner') {
      // D-13: owner location authority is the path segment (`/{locationSlug}/orders`) — the
      // server-side pin is retired for them; no write, no scope lookup.
      return { locationId: null };
    }

    // The pin used to be immutable for a session: a second call threw and the member had to sign
    // out to cover another point. It protected nothing — every request is authorised against
    // `member_location_scope` regardless of where the session started, so a pin that never moved
    // proved nothing the check does not already enforce, while costing a re-login to a manager
    // working two points. A terminal bolted to one location is expressed by giving that member a
    // role at one location, which the scope below already enforces.
    const previous = await this.writer.readActiveLocationId(input.sessionToken);

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

    if (previous !== null && previous !== input.locationId) {
      this.logger.log(
        {
          userId: input.userId,
          tenantId: input.tenantId,
          fromLocationId: previous,
          toLocationId: input.locationId,
        },
        'Staff switched active location.',
      );
    }

    return { locationId: input.locationId };
  }
}
