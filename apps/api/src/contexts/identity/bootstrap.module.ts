import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../infrastructure/database.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IdentityCoreModule } from './identity-core.module';
import { BootstrapOwnerService } from './application/bootstrap-owner.service';
import { TENANT_LOOKUP_PORT } from './application/ports/tenant-lookup.port';
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
  imports: [ConfigModule, DatabaseModule, TenancyModule, IdentityCoreModule],
  providers: [
    BootstrapOwnerService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
  ],
  exports: [BootstrapOwnerService],
})
export class BootstrapModule {}
