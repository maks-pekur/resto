import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import type { IdentityRevocationPort } from '../../tenancy/application/ports/identity-revocation.port';
import { RevokeUserSessionsService } from '../application/revoke-user-sessions.service';

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
