import { Module, type Provider } from '@nestjs/common';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { buildAuth, type Auth } from './infrastructure/better-auth/auth.config';
import { buildAuthDrizzle, type AuthDrizzle } from './infrastructure/better-auth/auth-db';
import { BetterAuthPermissionChecker } from './infrastructure/better-auth/permission-checker.adapter';
import { PERMISSION_CHECKER } from './application/ports/permission-checker.port';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from './identity.tokens';

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
    // Admin (and other browser callers) hit BA from a different origin
    // than the api's `baseURL`; BA enforces an Origin allowlist on
    // mutating requests. Add `ADMIN_WEB_URL` when configured.
    const trustedOrigins: string[] = [];
    if (env.ADMIN_WEB_URL) trustedOrigins.push(env.ADMIN_WEB_URL);
    return buildAuth({
      authDb,
      secret: env.BETTER_AUTH_SECRET ?? DEV_BA_SECRET_FALLBACK,
      baseUrl: env.BETTER_AUTH_BASE_URL ?? 'http://localhost:4000',
      trustedOrigins,
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
  ],
  exports: [authProvider, authDrizzleProvider, permissionCheckerProvider],
})
export class IdentityCoreModule {}

export { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from './identity.tokens';
