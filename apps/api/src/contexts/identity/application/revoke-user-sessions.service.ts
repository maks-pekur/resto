import { Inject, Injectable } from '@nestjs/common';
import { BA_SESSION_REVOKER, type BaSessionRevoker } from './ports/ba-session-revoker.port';

@Injectable()
export class RevokeUserSessionsService {
  constructor(@Inject(BA_SESSION_REVOKER) private readonly sessions: BaSessionRevoker) {}

  async revokeAllForTenant(tenantId: string): Promise<{ revokedSessionsCount: number }> {
    return this.sessions.revokeTenantSessions(tenantId);
  }
}
