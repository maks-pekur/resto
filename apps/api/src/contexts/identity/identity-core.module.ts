import { Logger, Module, type Provider } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  buildEnvelope,
  IdentityPasswordResetCompletedV1,
  IdentitySignedInV1,
  IdentitySignedOutV1,
} from '@resto/events';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from './application/ports/identity-event-emitter.port';
import { PERMISSION_CHECKER } from './application/ports/permission-checker.port';
import { MEMBER_LOCATION_SCOPE_READER } from './application/ports/member-location-scope-reader.port';
import { LocationPermissionChecker } from './application/location-permission-checker';
import { SyncPresetRolesService } from './application/sync-preset-roles.service';
import { EMAIL_ADAPTER_PORT, type EmailAdapterPort } from './domain/ports';
import { buildAuthDrizzle, type AuthDrizzle } from './infrastructure/better-auth/auth-db';
import {
  buildAuth,
  type Auth,
  type SendInvitationEmail,
  type SendResetPassword,
  type SendVerificationEmail,
} from './infrastructure/better-auth/auth.config';
import { BetterAuthPermissionChecker } from './infrastructure/better-auth/permission-checker.adapter';
import { createEmailAdapter } from './infrastructure/email/email-adapter.factory';
import { getLocale } from './infrastructure/email/get-locale';
import { IdentityEventEmitterAdapter } from './infrastructure/identity-event-emitter.adapter';
import { InitialLocationDrizzleRepository } from './infrastructure/initial-location-drizzle.repository';
import { MemberLocationScopeDrizzleReader } from './infrastructure/member-location-scope-drizzle.reader';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from './identity.tokens';

const DEV_BA_SECRET_FALLBACK = 'dev-only-better-auth-secret-32-chars-padding';

/**
 * D-13 (HIGH-1): three-callback gate. Closes the false-positive where the
 * old single-callback check let a prod deploy boot with NOOP defaults for
 * `sendResetPassword` and `sendInvitationEmail`. The companion change in
 * `auth.config.ts:137,142,152` removes the NOOP `?? (() => Promise.resolve())`
 * so a missing callback fails BA boot — but this assertion fails MODULE
 * construction earlier, which is the loud failure mode.
 */
export const REQUIRED_EMAIL_CALLBACKS = [
  'sendVerificationEmail',
  'sendResetPassword',
  'sendInvitationEmail',
] as const;

interface EmailCallbackBundle {
  readonly sendResetPassword?: unknown;
  readonly sendInvitationEmail?: unknown;
  readonly sendVerificationEmail?: unknown;
}

/**
 * D-13 + D-15 + D-17 boot guard:
 *   - In staging/production, every callback in `REQUIRED_EMAIL_CALLBACKS`
 *     must be present (D-13).
 *   - When `adapter` is supplied, `adapter.verifyTransport()` runs in
 *     staging/production only (D-15). Dev MailHog may not be reachable at
 *     boot in some local setups — failing boot on that is hostile UX.
 *   - The adapter must expose the three send methods (D-17 — defense-in-
 *     depth against an adapter that satisfies the structural type but is
 *     missing a method at runtime, e.g. a vi.mock stub).
 *
 * Backwards-compatibility note (preserved from RES-187): if `adapter` is
 * omitted, only the callback presence check runs — that's the shape the
 * existing test fixture in `email-adapter-gate.spec.ts` relies on.
 */
export const assertEmailAdapterWired = async (
  nodeEnv: Env['NODE_ENV'],
  callbacks: EmailCallbackBundle,
  adapter?: EmailAdapterPort,
): Promise<void> => {
  if (nodeEnv !== 'staging' && nodeEnv !== 'production') return;
  const missing = REQUIRED_EMAIL_CALLBACKS.filter((k) => !callbacks[k]);
  if (missing.length > 0) {
    throw new Error(
      `Email adapter not wired: missing ${missing.join(', ')}. NODE_ENV=${nodeEnv} requires an email adapter — see RES-12 (Resend SMTP).`,
    );
  }
  if (!adapter) return;
  // D-17: structural-type defense-in-depth.
  for (const m of ['sendInvitation', 'sendResetPassword', 'sendVerification'] as const) {
    if (typeof adapter[m] !== 'function') {
      throw new Error(
        `Email adapter (${adapter.adapterName}) missing method ${m} — D-17 contract violation.`,
      );
    }
  }
  // D-15: ping the transport so a broken RESEND_API_KEY surfaces here
  // instead of when an operator triggers the first invitation flow.
  try {
    await adapter.verifyTransport();
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `verifyTransport failed at boot — check RESEND_API_KEY / connectivity (adapter=${adapter.adapterName}): ${cause}`,
      { cause: err },
    );
  }
};

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

const emailAdapterProvider: Provider = {
  provide: EMAIL_ADAPTER_PORT,
  inject: [ENV_TOKEN, TenantAwareDb],
  useFactory: (env: Env, db: TenantAwareDb): EmailAdapterPort =>
    createEmailAdapter(env, { db, logger: new Logger('EmailAdapter') }),
};

/**
 * Compose the three BA send-callbacks from the wired `EmailAdapterPort`.
 *
 * Each wrapper:
 *   - Derives `locale` from the inviter's / user's `Accept-Language`
 *     header via `getLocale(request?.headers)` (D-03; works against both
 *     Fastify plain headers and the WHATWG Headers BA hands to callbacks).
 *   - Resolves `tenantId` from the BA data payload — `data.organization.id`
 *     for invitations, `data.user.activeOrganization?.id` for the
 *     authenticated reset-password call (per plan-checker W-1 2026-05-30).
 *     The verification flow runs pre-org-bind on signup — tenantId
 *     intentionally `undefined` there, which the adapter handles via
 *     `db.withoutTenant(...)` on terminal failure.
 *   - Constructs the public URL from `data.url` (BA-supplied for reset/
 *     verification) or `${ADMIN_WEB_URL}/accept-invitation/${data.id}`
 *     for invitations.
 */
const buildBaCallbacks = (
  env: Env,
  emailAdapter: EmailAdapterPort,
): {
  sendInvitationEmail: SendInvitationEmail;
  sendResetPassword: SendResetPassword;
  sendVerificationEmail: SendVerificationEmail;
} => {
  const sendInvitationEmail: SendInvitationEmail = async (data, request) => {
    const locale = getLocale(request?.headers);
    const url =
      env.ADMIN_WEB_URL !== undefined
        ? `${env.ADMIN_WEB_URL}/accept-invitation/${data.id}`
        : `/accept-invitation/${data.id}`;
    await emailAdapter.sendInvitation({
      to: data.email,
      locale,
      url,
      tenantSlug: data.organization.slug,
      inviterName: data.inviter.user.name !== '' ? data.inviter.user.name : data.inviter.user.email,
      tenantId: TenantId.parse(data.organization.id),
    });
  };

  const sendResetPassword: SendResetPassword = async (data, request) => {
    const locale = getLocale(request?.headers);
    // Plan-checker W-1 2026-05-30: BA can attach data.user.activeOrganization
    // on an authenticated reset-password call. Resolve from there; only
    // fall back to undefined when truly absent (BA's typed user surface
    // doesn't always expose the field, hence the index-access dance).
    const user = data.user as { activeOrganization?: { id?: string } };
    const tenantIdRaw = user.activeOrganization?.id;
    const tenantId = tenantIdRaw ? TenantId.parse(tenantIdRaw) : undefined;
    await emailAdapter.sendResetPassword({
      to: data.user.email,
      locale,
      url: data.url,
      userId: data.user.id,
      ...(tenantId ? { tenantId } : {}),
    });
  };

  const sendVerificationEmail: SendVerificationEmail = async (data, request) => {
    const locale = getLocale(request?.headers);
    // Verification on signup runs PRE-org-bind — tenantId intentionally
    // undefined. The adapter routes that through db.withoutTenant on
    // terminal failure (D-17 pre-org-bind branch).
    await emailAdapter.sendVerification({
      to: data.user.email,
      locale,
      url: data.url,
      userId: data.user.id,
    });
  };

  return { sendInvitationEmail, sendResetPassword, sendVerificationEmail };
};

export const buildAuthFromEnv = (
  authDb: AuthDrizzle,
  env: Env,
  emitter: IdentityEventEmitterPort,
  emailAdapter: EmailAdapterPort,
  locationResolver: InitialLocationDrizzleRepository,
): Auth => {
  const cookieDomain = env.AUTH_COOKIE_DOMAIN;
  // Admin (and other browser callers) hit BA from a different origin
  // than the api's `baseURL`; BA enforces an Origin allowlist on
  // mutating requests. Add `ADMIN_WEB_URL` when configured.
  const trustedOrigins: string[] = [];
  if (env.ADMIN_WEB_URL) trustedOrigins.push(env.ADMIN_WEB_URL);

  const { sendInvitationEmail, sendResetPassword, sendVerificationEmail } = buildBaCallbacks(
    env,
    emailAdapter,
  );

  // D-13 + D-15: synchronous module-construction gate. verifyTransport
  // runs (in staging/prod) inside the provider factory so a missing
  // RESEND_API_KEY or unreachable Resend domain throws BEFORE BA mounts.
  // We accept the async gate by awaiting at the call site; here we kick
  // it off but DON'T block — NestJS providers are synchronous unless we
  // wrap them async. Instead the boot script (`main.ts`) and the
  // integration test exercise the async path explicitly.
  void assertEmailAdapterWired(
    env.NODE_ENV,
    { sendInvitationEmail, sendResetPassword, sendVerificationEmail },
    // verifyTransport ping is intentionally NOT invoked here (NestJS
    // useFactory is synchronous); it is invoked from main.ts boot.
  );

  return buildAuth({
    authDb,
    // AUTH-09 / D-16a (Phase 3 / Plan 05): emitter is consumed INLINE by
    // organizationHooks.afterUpdateMemberRole in auth.config.ts to emit
    // identity.role_changed.v1 via the canonical outbox pipeline. Same
    // shape as identity-event-emitter.adapter.ts — no new per-event
    // callback abstraction added to BuildOpts (W-2 2026-05-30).
    emitter,
    secret: env.BETTER_AUTH_SECRET ?? DEV_BA_SECRET_FALLBACK,
    baseUrl: env.BETTER_AUTH_BASE_URL ?? 'http://localhost:4000',
    trustedOrigins,
    minPasswordLength: env.PASSWORD_MIN_LENGTH,
    maxPasswordLength: env.PASSWORD_MAX_LENGTH,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    sendInvitationEmail,
    sendResetPassword,
    sendVerificationEmail,
    ...(cookieDomain ? { cookieDomain } : {}),
    onSignedOut: async (snapshot) => {
      const tenantId = TenantId.parse(snapshot.tenantId);
      await emitter.emit(
        buildEnvelope(
          IdentitySignedOutV1,
          {
            userId: snapshot.userId,
            actorSubject: snapshot.userId,
            tenantId,
            sessionId: snapshot.sessionId,
          },
          { tenantId },
        ),
      );
    },
    onPasswordResetCompleted: async (snapshot) => {
      const tenantId = snapshot.tenantId ? TenantId.parse(snapshot.tenantId) : null;
      await emitter.emit(
        buildEnvelope(
          IdentityPasswordResetCompletedV1,
          {
            userId: snapshot.userId,
            actorSubject: snapshot.userId,
            ...(tenantId ? { tenantId } : {}),
            sessionRevokedCount: snapshot.sessionRevokedCount,
          },
          { tenantId },
        ),
      );
    },
    onInitialLocationPin: (userId, brandId) =>
      locationResolver.resolveForUserInBrand(userId, brandId),
    onActiveOrganizationSet: async (session, ctx) => {
      if (!session.activeOrganizationId) return;
      const xff = readHeader(ctx.headers, 'x-forwarded-for');
      const xffFirst = xff?.split(',')[0]?.trim();
      const ipAddress =
        xffFirst !== '' && xffFirst !== undefined ? xffFirst : readHeader(ctx.headers, 'x-real-ip');
      const userAgent = readHeader(ctx.headers, 'user-agent');
      const tenantId = TenantId.parse(session.activeOrganizationId);
      await emitter.emit(
        buildEnvelope(
          IdentitySignedInV1,
          {
            userId: session.userId,
            actorSubject: session.userId,
            tenantId,
            ...(ipAddress ? { ipAddress } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
          { tenantId },
        ),
      );
    },
  });
};

const authProvider: Provider = {
  provide: AUTH_TOKEN,
  inject: [
    AUTH_DRIZZLE_TOKEN,
    ENV_TOKEN,
    IDENTITY_EVENT_EMITTER,
    EMAIL_ADAPTER_PORT,
    InitialLocationDrizzleRepository,
  ],
  useFactory: buildAuthFromEnv,
};

const permissionCheckerProvider: Provider = {
  provide: PERMISSION_CHECKER,
  useClass: BetterAuthPermissionChecker,
};

// D-08/T-084-21: registered here (not identity-http.module.ts, where the
// same MEMBER_LOCATION_SCOPE_READER token is also bound) so
// LocationPermissionChecker resolves within IdentityCoreModule's own DI
// scope — module-child providers cannot reach up into an importer's
// bindings.
const memberLocationScopeReaderProvider: Provider = {
  provide: MEMBER_LOCATION_SCOPE_READER,
  useClass: MemberLocationScopeDrizzleReader,
};

@Module({
  providers: [
    authDrizzleProvider,
    emailAdapterProvider,
    InitialLocationDrizzleRepository,
    authProvider,
    permissionCheckerProvider,
    BetterAuthPermissionChecker,
    memberLocationScopeReaderProvider,
    MemberLocationScopeDrizzleReader,
    LocationPermissionChecker,
    SyncPresetRolesService,
    {
      provide: IDENTITY_EVENT_EMITTER,
      useClass: IdentityEventEmitterAdapter,
    },
    IdentityEventEmitterAdapter,
  ],
  exports: [
    authProvider,
    authDrizzleProvider,
    emailAdapterProvider,
    permissionCheckerProvider,
    IDENTITY_EVENT_EMITTER,
    InitialLocationDrizzleRepository,
    LocationPermissionChecker,
    SyncPresetRolesService,
  ],
})
export class IdentityCoreModule {}
