import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { RevokeUserSessionsService } from '../../identity/application/revoke-user-sessions.service';
import type { IdentityRevocationPort } from '../application/ports/identity-revocation.port';

@Injectable()
export class IdentityRevocationAdapter implements IdentityRevocationPort {
  constructor(
    @Inject(RevokeUserSessionsService)
    private readonly revoker: RevokeUserSessionsService,
  ) {}

  async revokeAllSessionsForTenant(tenantId: TenantId): Promise<{ revokedSessionsCount: number }> {
    return this.revoker.revokeAllForTenant(tenantId);
  }
}
