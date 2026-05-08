import { randomUUID } from 'node:crypto';
import { Module, type Provider } from '@nestjs/common';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { buildAuth, type Auth } from './infrastructure/better-auth/auth.config';
import { buildAuthDrizzle, type AuthDrizzle } from './infrastructure/better-auth/auth-db';
import { BetterAuthPermissionChecker } from './infrastructure/better-auth/permission-checker.adapter';
import { PERMISSION_CHECKER } from './application/ports/permission-checker.port';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from './identity.tokens';
import { TenantId } from '@resto/domain';
import { IdentitySignedInV1, IdentitySignedOutV1 } from '@resto/events';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from './application/ports/identity-event-emitter.port';
import { IdentityEventEmitterAdapter } from './infrastructure/identity-event-emitter.adapter';

const DEV_BA_SECRET_FALLBACK = 'dev-only-better-auth-secret-32-chars-padding';

const readHeader = (
  headers: Record<string, string | string[] | undefined> | Headers | undefined,
  name: string,
): string | undefined => {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const raw = (headers as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

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
  inject: [AUTH_DRIZZLE_TOKEN, ENV_TOKEN, IDENTITY_EVENT_EMITTER],
  useFactory: (authDb: AuthDrizzle, env: Env, emitter: IdentityEventEmitterPort): Auth => {
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
      onSignedOut: async (snapshot) => {
        const tenantId = TenantId.parse(snapshot.tenantId);
        await emitter.emit({
          id: randomUUID(),
          type: IdentitySignedOutV1.type,
          version: IdentitySignedOutV1.version,
          tenantId,
          correlationId: randomUUID(),
          causationId: null,
          occurredAt: new Date(),
          payload: {
            userId: snapshot.userId,
            actorSubject: snapshot.userId,
            tenantId,
            sessionId: snapshot.sessionId,
          },
        });
      },
      onActiveOrganizationSet: async (session, ctx) => {
        if (!session.activeOrganizationId) return;
        const xff = readHeader(ctx.headers, 'x-forwarded-for');
        const xffFirst = xff?.split(',')[0]?.trim();
        const ipAddress =
          xffFirst !== '' && xffFirst !== undefined
            ? xffFirst
            : readHeader(ctx.headers, 'x-real-ip');
        const userAgent = readHeader(ctx.headers, 'user-agent');
        const tenantId = TenantId.parse(session.activeOrganizationId);
        await emitter.emit({
          id: randomUUID(),
          type: IdentitySignedInV1.type,
          version: IdentitySignedInV1.version,
          tenantId,
          correlationId: randomUUID(),
          causationId: null,
          occurredAt: new Date(),
          payload: {
            userId: session.userId,
            actorSubject: session.userId,
            tenantId,
            ...(ipAddress ? { ipAddress } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
        });
      },
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
    {
      provide: IDENTITY_EVENT_EMITTER,
      useClass: IdentityEventEmitterAdapter,
    },
    IdentityEventEmitterAdapter,
  ],
  exports: [authProvider, authDrizzleProvider, permissionCheckerProvider, IDENTITY_EVENT_EMITTER],
})
export class IdentityCoreModule {}

export { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from './identity.tokens';
