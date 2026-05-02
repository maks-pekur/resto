import { Inject, Module, type OnModuleInit, type Provider } from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { buildAuth, type Auth } from './infrastructure/better-auth/auth.config';
import { buildAuthDrizzle, type AuthDrizzle } from './infrastructure/better-auth/auth-db';
import { BetterAuthPermissionChecker } from './infrastructure/better-auth/permission-checker.adapter';
import { PERMISSION_CHECKER } from './application/ports/permission-checker.port';
import { AuthGuard } from './interfaces/http/guards/auth.guard';
import { PermissionsGuard } from './interfaces/http/guards/permissions.guard';
import { registerBetterAuthHandler } from './interfaces/http/better-auth.handler';

export const AUTH_TOKEN = Symbol('Auth');
export const AUTH_DRIZZLE_TOKEN = Symbol('AuthDrizzle');

const DEV_BA_SECRET_FALLBACK = 'dev-only-better-auth-secret-32-chars-padding';

const authDrizzleProvider: Provider = {
  provide: AUTH_DRIZZLE_TOKEN,
  inject: [ENV_TOKEN],
  useFactory: (env: Env): AuthDrizzle => {
    const url =
      env.BETTER_AUTH_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/\/[^:]+:/u, '//resto_auth:').replace(
        /:[^@]+@/u,
        ':auth_password_dev@',
      );
    if (!url) {
      throw new Error('BETTER_AUTH_DATABASE_URL must be set (or DATABASE_URL in dev).');
    }
    return buildAuthDrizzle(url);
  },
};

const authProvider: Provider = {
  provide: AUTH_TOKEN,
  inject: [AUTH_DRIZZLE_TOKEN, ENV_TOKEN],
  useFactory: (authDb: AuthDrizzle, env: Env): Auth => {
    const cookieDomain = env.AUTH_COOKIE_DOMAIN;
    return buildAuth({
      authDb,
      secret: env.BETTER_AUTH_SECRET ?? DEV_BA_SECRET_FALLBACK,
      baseUrl: env.BETTER_AUTH_BASE_URL ?? 'http://localhost:4000',
      ...(cookieDomain ? { cookieDomain } : {}),
    });
  },
};

const permissionCheckerProvider: Provider = {
  provide: PERMISSION_CHECKER,
  useClass: BetterAuthPermissionChecker,
};

@Module({
  providers: [
    authDrizzleProvider,
    authProvider,
    permissionCheckerProvider,
    BetterAuthPermissionChecker,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [authProvider, authDrizzleProvider, permissionCheckerProvider],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly httpHost: HttpAdapterHost,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
  ) {}

  onModuleInit(): void {
    const fastify: FastifyInstance = this.httpHost.httpAdapter.getInstance();
    registerBetterAuthHandler(fastify, this.auth);
  }
}
