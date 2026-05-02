import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { IdentityCoreModule } from './identity-core.module';
import { AUTH_TOKEN } from './identity.tokens';
import type { Auth } from './infrastructure/better-auth/auth.config';
import { AuthGuard } from './interfaces/http/guards/auth.guard';
import { PermissionsGuard } from './interfaces/http/guards/permissions.guard';
import { registerBetterAuthHandler } from './interfaces/http/better-auth.handler';
import { MeController } from './interfaces/http/me.controller';

@Module({
  imports: [IdentityCoreModule],
  controllers: [MeController],
  providers: [
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
