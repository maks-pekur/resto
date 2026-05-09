import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin, type Where } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { organization, twoFactor, bearer } from 'better-auth/plugins';
import type { OrganizationOptions } from 'better-auth/plugins';
import { Logger } from '@nestjs/common';
import { ac, ownerRole, adminRole, staffRole } from './access-control';
import { buildBetterAuthDrizzleAdapter } from './drizzle-adapter';
import type { AuthDrizzle } from './auth-db';

type SendInvitationEmail = NonNullable<OrganizationOptions['sendInvitationEmail']>;
type SendResetPassword = NonNullable<
  NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']
>;

interface BuildOpts {
  authDb: AuthDrizzle;
  secret: string;
  baseUrl: string;
  cookieDomain?: string;
  /**
   * Cross-origin browser callers BA must accept (CSRF / Origin check).
   * Admin runs on a different port in dev (`:3001`) and a different
   * subdomain in prod (`admin.resto.app`); `baseUrl` only covers the
   * api itself. Pass them all here.
   */
  trustedOrigins?: readonly string[];
  /**
   * Phase F supplies the email adapter. Phase A leaves it as a no-op so
   * forget-password and invitation flows do not crash, but no email is
   * actually sent.
   *
   * The data shape matches BA's organization plugin callback exactly —
   * typed via OrganizationOptions so any BA upgrade will surface here.
   */
  sendInvitationEmail?: SendInvitationEmail;
  /**
   * Phase F supplies the email adapter. Phase A leaves it as a no-op so
   * forget-password flows do not crash, but no email is actually sent.
   */
  sendResetPassword?: SendResetPassword;
  /**
   * Invoked when an operator sets the active organization on their session
   * (i.e. after `POST /api/auth/organization/set-active` completes). This is
   * the canonical "operator signed in" moment. The callback runs in a
   * separate transaction from BA's session update; failures are logged at
   * error level and swallowed — audit pipeline is eventually-consistent
   * observability; we never block sign-in on an audit-write failure.
   */
  onActiveOrganizationSet?: (
    session: { userId: string; activeOrganizationId?: string | null },
    ctx: { headers?: Record<string, string | string[] | undefined> | Headers },
  ) => Promise<void>;
  /**
   * Invoked from the BA `hooks.after` middleware on a successful
   * `POST /api/auth/sign-out`. Receives the userId / tenantId / sessionId
   * captured in the matching `hooks.before` (the session row no longer
   * exists by the time `after` runs). Failures are logged at error level
   * and swallowed — audit is eventually-consistent observability; we
   * never block sign-out on an audit-write failure.
   */
  onSignedOut?: (snapshot: {
    userId: string;
    tenantId: string;
    sessionId: string;
  }) => Promise<void>;
  /**
   * Invoked from the BA `hooks.after` middleware on a successful
   * `POST /api/auth/reset-password`. Receives the userId, the user's
   * primary tenant id (if known — derived from the user's organizations),
   * and the count of sessions deleted. Failures are logged at error level
   * and swallowed — audit is eventually-consistent observability; we never
   * block the reset on an audit-write failure. Revocation itself happens
   * before this callback is invoked, so a logger failure does not leave
   * sessions alive.
   */
  onPasswordResetCompleted?: (snapshot: {
    userId: string;
    tenantId: string | null;
    sessionRevokedCount: number;
  }) => Promise<void>;
}

const resolvePrimaryTenantId = async (
  adapter: {
    findMany: (data: { model: string; where?: Where[]; limit?: number }) => Promise<unknown[]>;
  },
  userId: string,
): Promise<string | null> => {
  try {
    const rows = await adapter.findMany({
      model: 'member',
      where: [{ field: 'userId', operator: 'eq', value: userId }],
      limit: 1,
    });
    const first = rows[0] as { organizationId?: string } | undefined;
    return first?.organizationId ?? null;
  } catch {
    return null;
  }
};

/**
 * Composition root for Better Auth.
 *
 * Phase A scope:
 *   - Email + password (no email verification yet — Phase F).
 *   - Organization plugin with system roles + dynamicAccessControl.
 *   - 2FA (TOTP) plugin enabled (operator MFA opt-in).
 *   - Bearer plugin (mobile bearer-token transport, exercised in Phase D).
 *
 * Out of scope:
 *   - phoneNumber plugin — Phase D wires it with proper signUpOnVerification.
 *
 * BA-specific code lives ONLY in this folder per hedging condition #5.
 */
export const buildAuth = (opts: BuildOpts) =>
  betterAuth({
    database: buildBetterAuthDrizzleAdapter(opts.authDb),
    secret: opts.secret,
    baseURL: opts.baseUrl,
    trustedOrigins: [...(opts.trustedOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Phase F flips this once email adapter lands
      sendResetPassword: opts.sendResetPassword ?? (() => Promise.resolve()),
    },
    plugins: [
      // Cast needed: organization()'s concrete endpoint overloads don't
      // satisfy BetterAuthPlugin's { [key: string]: Endpoint } index sig
      // in BA 1.3.x — a known upstream typing gap, runtime is correct.
      organization({
        ac,
        roles: { owner: ownerRole, admin: adminRole, staff: staffRole },
        dynamicAccessControl: { enabled: true },
        sendInvitationEmail: opts.sendInvitationEmail ?? (() => Promise.resolve()),
      }) as unknown as BetterAuthPlugin,
      twoFactor(),
      bearer(),
    ],
    user: {
      additionalFields: {
        requiresPasswordChange: {
          type: 'boolean',
          defaultValue: false,
          input: false, // not settable through public sign-up; set server-side
          returned: true, // surfaced on session.user so the admin UI can read it
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7d, spec §3.5
      updateAge: 60 * 60 * 24, // 1d rolling
    },
    databaseHooks: {
      session: {
        update: {
          after: async (session, ctx) => {
            if (!opts.onActiveOrganizationSet) return;
            if (typeof session.activeOrganizationId !== 'string' || !session.activeOrganizationId)
              return;
            const rawRequest = (ctx as { request?: Request } | undefined)?.request;
            const path = rawRequest?.url ? new URL(rawRequest.url, 'http://x').pathname : '';
            if (!path.endsWith('/api/auth/organization/set-active')) return;
            try {
              const reqHeaders = rawRequest?.headers;
              await opts.onActiveOrganizationSet(
                {
                  userId: session.userId,
                  activeOrganizationId: session.activeOrganizationId,
                },
                {
                  ...(reqHeaders ? { headers: reqHeaders } : {}),
                },
              );
            } catch (err) {
              new Logger('IdentityEventHook').error(
                {
                  err,
                  type: 'identity.signed_in.v1',
                  userId: session.userId,
                  tenantId: session.activeOrganizationId,
                },
                'Failed to emit identity event — audit row may be missing',
              );
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (path.endsWith('/sign-out')) {
          if (!opts.onSignedOut) return;
          const token = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          );
          if (!token) return;
          const found = await ctx.context.internalAdapter.findSession(token);
          if (!found) return;
          const activeOrgId = (found.session as { activeOrganizationId?: string | null })
            .activeOrganizationId;
          if (typeof activeOrgId !== 'string' || !activeOrgId) return;
          (
            ctx.context as {
              __restoSignOut?: { userId: string; tenantId: string; sessionId: string };
            }
          ).__restoSignOut = {
            userId: found.user.id,
            tenantId: activeOrgId,
            sessionId: found.session.id,
          };
          return;
        }
        if (path.endsWith('/reset-password')) {
          if (!opts.onPasswordResetCompleted) return;
          const body = (ctx.body ?? {}) as { token?: string };
          if (typeof body.token !== 'string' || body.token.length === 0) return;
          const verification = await ctx.context.internalAdapter.findVerificationValue(
            `reset-password:${body.token}`,
          );
          if (!verification?.value) return;
          const userId = verification.value;
          if (typeof userId !== 'string' || userId.length === 0) return;
          let sessionCount = 0;
          try {
            const sessions = await ctx.context.internalAdapter.listSessions(userId);
            sessionCount = Array.isArray(sessions) ? sessions.length : 0;
          } catch {
            // listSessions failure is non-fatal — proceed with count = 0; the
            // load-bearing deleteSessions call in `after` does not depend on this.
          }
          (
            ctx.context as { __restoPasswordReset?: { userId: string; sessionCount: number } }
          ).__restoPasswordReset = {
            userId,
            sessionCount,
          };
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (path.endsWith('/sign-out')) {
          if (!opts.onSignedOut) return;
          const stash = (
            ctx.context as {
              __restoSignOut?: { userId: string; tenantId: string; sessionId: string };
            }
          ).__restoSignOut;
          if (!stash) return;
          if (ctx.context.returned instanceof Error) return;
          try {
            await opts.onSignedOut(stash);
          } catch (err) {
            new Logger('IdentityEventHook').error(
              {
                err,
                type: 'identity.signed_out.v1',
                userId: stash.userId,
                tenantId: stash.tenantId,
              },
              'Failed to emit identity.signed_out.v1',
            );
          }
          return;
        }
        if (path.endsWith('/reset-password')) {
          const stash = (
            ctx.context as { __restoPasswordReset?: { userId: string; sessionCount: number } }
          ).__restoPasswordReset;
          if (!stash) return;
          if (ctx.context.returned instanceof Error) return;
          if (!opts.onPasswordResetCompleted) return;
          try {
            await ctx.context.internalAdapter.deleteSessions(stash.userId);
            const tenantId = await resolvePrimaryTenantId(ctx.context.adapter, stash.userId);
            await opts.onPasswordResetCompleted({
              userId: stash.userId,
              tenantId,
              sessionRevokedCount: stash.sessionCount,
            });
          } catch (err) {
            new Logger('IdentityEventHook').error(
              { err, type: 'identity.password_reset_completed.v1', userId: stash.userId },
              'Failed during password-reset cascade',
            );
          }
        }
      }),
    },
    // Spread so the key is absent entirely when unset —
    // exactOptionalPropertyTypes rejects `advanced: undefined`.
    ...(opts.cookieDomain
      ? {
          advanced: {
            crossSubDomainCookies: { enabled: true, domain: opts.cookieDomain },
          },
        }
      : {}),
  });

export type Auth = ReturnType<typeof buildAuth>;
