import { Global, Module } from '@nestjs/common';
import { IDENTITY_REVOCATION_PORT } from '../tenancy/application/ports/identity-revocation.port';
import { BA_SESSION_REVOKER } from './application/ports/ba-session-revoker.port';
import { RevokeUserSessionsService } from './application/revoke-user-sessions.service';
import { IdentityCoreModule } from './identity-core.module';
import { BaSessionDrizzleRevoker } from './infrastructure/ba-session-drizzle.revoker';
import { IdentityRevocationAdapter } from './infrastructure/identity-revocation.adapter';

@Global()
@Module({
  imports: [IdentityCoreModule],
  providers: [
    RevokeUserSessionsService,
    IdentityRevocationAdapter,
    { provide: IDENTITY_REVOCATION_PORT, useClass: IdentityRevocationAdapter },
    { provide: BA_SESSION_REVOKER, useClass: BaSessionDrizzleRevoker },
    BaSessionDrizzleRevoker,
  ],
  exports: [IDENTITY_REVOCATION_PORT, RevokeUserSessionsService],
})
export class IdentitySessionsModule {}
