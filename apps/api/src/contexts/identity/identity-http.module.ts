import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IdentityCoreModule } from './identity-core.module';
import { AUTH_TOKEN } from './identity.tokens';
import type { Auth } from './infrastructure/better-auth/auth.config';
import { BootstrapOwnerService } from './application/bootstrap-owner.service';
import { TENANT_LOOKUP_PORT } from './application/ports/tenant-lookup.port';
import { TenantLookupAdapter } from './infrastructure/tenant-lookup.adapter';
import { AuthGuard } from './interfaces/http/guards/auth.guard';
import { PermissionsGuard } from './interfaces/http/guards/permissions.guard';
import { registerBetterAuthHandler } from './interfaces/http/better-auth.handler';
import { MeController } from './interfaces/http/me.controller';
import { InternalBootstrapController } from './interfaces/http/internal-bootstrap.controller';

/**
 * HTTP-side composition for the identity context. Imports
 * `IdentityCoreModule` for BA wiring and `TenancyModule` so the
 * tenant-lookup adapter (used by `BootstrapOwnerService` and the
 * bootstrap controller) can resolve `TenantQueriesService`.
 */
@Module({
  imports: [IdentityCoreModule, TenancyModule],
  controllers: [MeController, InternalBootstrapController],
  providers: [
    BootstrapOwnerService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class IdentityHttpModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly httpHost: HttpAdapterHost,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
  ) {}

  onModuleInit(): void {
    const fastify: FastifyInstance = this.httpHost.httpAdapter.getInstance();
    registerBetterAuthHandler(fastify, this.auth);
  }
}
