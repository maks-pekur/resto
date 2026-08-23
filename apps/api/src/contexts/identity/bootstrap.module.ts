import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../infrastructure/database.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IdentityCoreModule } from './identity-core.module';
import { IdentitySessionsModule } from './identity-sessions.module';
import { BootstrapOwnerService } from './application/signup/bootstrap-owner.service';
import { BA_USER_READER } from './application/ports/ba-user-reader.port';
import { TENANT_LOOKUP_PORT } from './application/ports/tenant-lookup.port';
import { BaUserDrizzleReader } from './infrastructure/ba-user-drizzle.reader';
import { TenantLookupAdapter } from './infrastructure/tenant-lookup.adapter';

/**
 * Slim composition root for CLI standalone-context use. No HTTP server,
 * no Fastify, no APP_GUARDs, no MeController — just enough to resolve
 * BootstrapOwnerService.
 *
 * The CLI calls NestFactory.createApplicationContext(BootstrapModule),
 * grabs the service, executes it, then closes the context.
 *
 * DatabaseModule is imported explicitly because TenancyModule's
 * TenantDrizzleRepository depends on TenantAwareDb. In the main app that
 * token is available via the @Global() DatabaseModule; here we must wire
 * it ourselves since there is no surrounding app context.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    IdentityCoreModule,
    IdentitySessionsModule,
    TenancyModule,
  ],
  providers: [
    BootstrapOwnerService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
    { provide: BA_USER_READER, useClass: BaUserDrizzleReader },
    BaUserDrizzleReader,
  ],
  exports: [BootstrapOwnerService],
})
export class BootstrapModule {}
