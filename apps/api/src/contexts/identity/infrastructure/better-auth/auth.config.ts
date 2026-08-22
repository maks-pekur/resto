import { ForbiddenException, Logger } from '@nestjs/common';
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin, type Where } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { OrganizationOptions } from 'better-auth/plugins';
import { bearer, organization, twoFactor } from 'better-auth/plugins';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { TenantId } from '@resto/domain';
import { containsNonDelegatable, SYSTEM_ROLES } from '@resto/domain';
import { buildEnvelope, IdentityRoleChangedV1 } from '@resto/events';
import { invitation as invitationTable, tenantRole as tenantRoleTable } from '@resto/db/schema';
import type { IdentityEventEmitterPort } from '../../application/ports/identity-event-emitter.port';
import { ac, adminRole, ownerRole, staffRole } from './access-control';
import type { AuthDrizzle } from './auth-db';
import { buildBetterAuthDrizzleAdapter } from './drizzle-adapter';
import { organizationSwitch } from './organization-switch.plugin';

export type SendInvitationEmail = NonNullable<OrganizationOptions['sendInvitationEmail']>;
export type SendResetPassword = NonNullable<
  NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']
>;
export type SendVerificationEmail = NonNullable<
  NonNullable<BetterAuthOptions['emailVerification']>['sendVerificationEmail']
>;

/**
 * AUTH-09 / D-16a (Phase 3 / Plan 05): explicit parameter type for the
 * `organizationHooks.afterUpdateMemberRole` callback. Sourced from BA
 * 1.4.22 `organization/types.d.mts:520-525`. Surfacing it as a named type
 * keeps the inline hook in `buildAuth()` zero-implicit-any — the
 * micro-task contract is "no `any` in the role-change hook".
 */
export type AfterUpdateMemberRoleHook = NonNullable<
  NonNullable<OrganizationOptions['organizationHooks']>['afterUpdateMemberRole']
>;
export type AfterUpdateMemberRoleData = Parameters<AfterUpdateMemberRoleHook>[0];

// D-16 (08.3): beforeUpdateMemberRole types mirror the after hook pattern above
export type BeforeUpdateMemberRoleHook = NonNullable<
  NonNullable<OrganizationOptions['organizationHooks']>['beforeUpdateMemberRole']
>;
export type BeforeUpdateMemberRoleData = Parameters<BeforeUpdateMemberRoleHook>[0];

interface BuildOpts {
  authDb: AuthDrizzle;
  /**
   * AUTH-09 / D-16a (Phase 3 / Plan 05): canonical event emitter shared
   * across the identity context. The `organizationHooks.afterUpdateMemberRole`
   * hook below uses it INLINE — emitter.emit() handles `db.withTenantId` +
   * `appendToOutbox` internally (see `identity-event-emitter.adapter.ts`),
   * so the hook stays free of direct DB knowledge.
   *
   * Plan-checker W-2 (2026-05-30) forbids adding NEW per-event callbacks to
   * BuildOpts (e.g. `onMemberRoleChanged?: (snapshot) => Promise<void>`).
   * `emitter` is the primitive dependency, not a per-event abstraction —
   * the same emitter handles every identity event the hook surface emits.
   * Optional so existing test fixtures (boot-integration spec etc.) that
   * construct `buildAuth({...})` without the audit pipeline still work.
   */
  emitter?: IdentityEventEmitterPort;
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
  sendVerificationEmail?: SendVerificationEmail;
  /** Default false to preserve back-compat; enable per environment. */
  requireEmailVerification?: boolean;
  /** From env — see config/env.schema.ts. Default 12 (NIST-aligned). */
  minPasswordLength?: number;
  /** From env — see config/env.schema.ts. Default 128. */
  maxPasswordLength?: number;
  onInitialLocationPin?: (userId: string, tenantId: string) => Promise<string | null>;
  /**
   * Invoked when an operator sets the active tenant on their session
   * (i.e. after `POST /api/auth/organization/set-active` completes). This is
   * the canonical "operator signed in" moment. The callback runs in a
   * separate transaction from BA's session update; failures are logged at
   * error level and swallowed — audit pipeline is eventually-consistent
   * observability; we never block sign-in on an audit-write failure.
   */
  onActiveTenantSet?: (
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

// AUTH-11 / D-22: WeakMap stashes keyed on the BA ctx.context object.
// WeakMap prevents property pollution on BA internals and allows GC to drop
// entries when the context is dropped. Replaces the prior `as { __resto* }`
// cast pattern that mutated enumerable properties on an internal BA object.
interface LocationPinDoneStash {
  readonly done: true;
}

const locationPinDone = new WeakMap<object, LocationPinDoneStash>();
interface SignOutStash {
  readonly userId: string;
  readonly tenantId: string;
  readonly sessionId: string;
}

interface PasswordResetStash {
  readonly userId: string;
  readonly sessionCount: number;
}

interface MemberRoleUpdateStash {
  readonly actorUserId: string;
}

const signOutStash = new WeakMap<object, SignOutStash>();
const passwordResetStash = new WeakMap<object, PasswordResetStash>();
const memberRoleUpdateStash = new WeakMap<object, MemberRoleUpdateStash>();

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
 *   - Bearer plugin (bearer-token transport for non-cookie clients, exercised in Phase D).
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
      requireEmailVerification: opts.requireEmailVerification ?? false,
      minPasswordLength: opts.minPasswordLength ?? 12,
      maxPasswordLength: opts.maxPasswordLength ?? 128,
      // D-13: NOOP `?? (() => Promise.resolve())` fallback removed. The
      // module-level `assertEmailAdapterWired` (identity-core.module.ts)
      // catches an unwired callback BEFORE BA boot in staging/prod, so
      // forwarding `opts.sendResetPassword` directly is safe — a missing
      // callback in non-dev means the boot guard already threw.
      ...(opts.sendResetPassword ? { sendResetPassword: opts.sendResetPassword } : {}),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      // D-13: NOOP fallback removed (see emailAndPassword above).
      ...(opts.sendVerificationEmail ? { sendVerificationEmail: opts.sendVerificationEmail } : {}),
    },
    plugins: [
      // Cast needed: organization()'s concrete endpoint overloads don't
      // satisfy BetterAuthPlugin's { [key: string]: Endpoint } index sig
      // in BA 1.3.x — a known upstream typing gap, runtime is correct.
      organization({
        ac,
        roles: { owner: ownerRole, admin: adminRole, staff: staffRole },
        // D-41: points BA at the tenant-named physical schema (migration 0079).
        // The value on each side must be the property key that exists on our
        // `@resto/db/schema` Drizzle table object, NOT the raw SQL column name —
        // BA's generic drizzle adapter resolves a field by doing
        // `schemaModel[resolvedFieldName]` (verified against
        // `better-auth/dist/adapters/drizzle-adapter/drizzle-adapter.mjs`), so
        // the override must match our camelCase Drizzle property (`tenantId`,
        // `activeTenantId`), not the physical column (`tenant_id`).
        schema: {
          session: { fields: { activeOrganizationId: 'activeTenantId' } },
          organizationRole: { modelName: 'tenantRole', fields: { organizationId: 'tenantId' } },
          member: { fields: { organizationId: 'tenantId' } },
          invitation: { fields: { organizationId: 'tenantId' } },
        },
        // D-13/D-17 (08.3): flag on; cap prevents unbounded per-request findMany cost
        dynamicAccessControl: { enabled: true, maximumRolesPerOrganization: 25 },
        // Pitfall 8 (RESEARCH.md): a malicious actor cannot invite a
        // mailbox they do not own and accept the invitation from a fresh
        // unverified account. Defends spoofing pre-AUTH-06 land.
        requireEmailVerificationOnInvitation: true,
        // D-13: NOOP fallback removed (see emailAndPassword above).
        ...(opts.sendInvitationEmail ? { sendInvitationEmail: opts.sendInvitationEmail } : {}),
        // AUTH-09 / D-16a (Phase 3 / Plan 05): emit `identity.role_changed.v1`
        // on every BA-driven role mutation. Hook signature per BA 1.4.22
        // `organization/types.d.mts:520-525` — `previousRole` is the prior
        // slug, `member.role` is the new one, `member.organizationId` is
        // the tenant. Wired INLINE here (per plan-checker W-2 2026-05-30 —
        // no per-event callback abstraction added to BuildOpts).
        // `opts.emitter` encapsulates the canonical `db.withTenantId` +
        // `appendToOutbox` pipeline (see `identity-event-emitter.adapter.ts`),
        // so the hook body stays infrastructure-free.
        // Failures are caught + logged + swallowed — audit is eventually-
        // consistent observability; we never block the BA role-change
        // response on an audit-write failure.
        organizationHooks: {
          // T-083-17 (08.3): defense-in-depth backstop — fires even when a caller
          // bypasses assign-role.service and hits BA's endpoint directly.
          beforeUpdateMemberRole: async (data: BeforeUpdateMemberRoleData) => {
            const newRole = data.newRole;
            const orgId = data.organization.id;
            let targetPermission: Record<string, string[]> | null = null;
            const systemRole = (SYSTEM_ROLES as Record<string, Record<string, readonly string[]>>)[
              newRole
            ];
            if (systemRole) {
              targetPermission = Object.fromEntries(
                Object.entries(systemRole).map(([r, a]) => [r, [...a]]),
              );
            } else {
              try {
                const rows = await opts.authDb.db
                  .select({ permission: tenantRoleTable.permission })
                  .from(tenantRoleTable)
                  .where(
                    and(
                      eq(tenantRoleTable.tenantId, orgId),
                      eq(tenantRoleTable.role, newRole),
                      isNull(tenantRoleTable.archivedAt),
                    ),
                  )
                  .limit(1);
                const raw = rows[0]?.permission;
                if (typeof raw === 'string') {
                  targetPermission = JSON.parse(raw) as Record<string, string[]>;
                }
              } catch {
                throw new ForbiddenException({
                  code: 'role.insufficient_permissions',
                  message: 'Cannot verify target role permissions.',
                });
              }
              // T-083-17 (08.3): unknown/archived slug → deny by default (fail closed)
              if (targetPermission === null) {
                throw new ForbiddenException({
                  code: 'role.insufficient_permissions',
                  message: 'Unknown or archived target role.',
                });
              }
            }
            if (containsNonDelegatable(targetPermission)) {
              throw new ForbiddenException({
                code: 'role.insufficient_permissions',
                message: 'You cannot assign a role bearing non-delegatable permissions.',
              });
            }
          },
          afterUpdateMemberRole: async (data: AfterUpdateMemberRoleData) => {
            if (!opts.emitter) return;
            // D-16 (08.3): capture actorUserId stashed in hooks.before
            const stash = memberRoleUpdateStash.get(
              (data as unknown as { ctx?: { context?: object } }).ctx?.context ?? {},
            );
            try {
              const tenantId = TenantId.parse(data.member.organizationId);
              await opts.emitter.emit(
                buildEnvelope(
                  IdentityRoleChangedV1,
                  {
                    userId: data.user.id,
                    tenantId,
                    previousRole: data.previousRole,
                    newRole: data.member.role,
                    ...(stash ? { actorUserId: stash.actorUserId } : {}),
                  },
                  { tenantId },
                ),
              );
            } catch (err) {
              new Logger('IdentityEventHook').error(
                {
                  err,
                  type: 'identity.role_changed.v1',
                  userId: data.user.id,
                  tenantId: data.member.organizationId,
                },
                'Failed to emit identity.role_changed.v1',
              );
            }
          },
        },
      }) as unknown as BetterAuthPlugin,
      organizationSwitch(),
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
      additionalFields: {
        activeLocationId: {
          type: 'string',
          defaultValue: null,
          input: false,
          returned: true,
        },
      },
    },
    databaseHooks: {
      session: {
        update: {
          after: async (session, ctx) => {
            if (typeof session.activeOrganizationId !== 'string' || !session.activeOrganizationId)
              return;
            const rawRequest = (ctx as { request?: Request } | undefined)?.request;
            const path = rawRequest?.url ? new URL(rawRequest.url, 'http://x').pathname : '';
            if (path !== '/api/auth/organization/set-active') return;

            const ctxContext = (ctx as { context?: object } | null)?.context;

            const internalAdapter = (
              ctx as {
                context?: {
                  internalAdapter?: {
                    updateSession?: (
                      token: string,
                      data: Record<string, unknown>,
                    ) => Promise<unknown>;
                  };
                };
              } | null
            )?.context?.internalAdapter;

            // D-19/D-40/D-41: the initial-pin hook this replaced gated location-pin
            // on a value produced by a sibling pin step that no longer exists (the
            // merged entity's id doubles as that successor value). Single-fire per
            // request context, and skipped once a location is already bound so a
            // later, unrelated session update on this same path cannot clobber an
            // explicit user pick.
            if (
              !(session as { activeLocationId?: string | null }).activeLocationId &&
              !(ctxContext && locationPinDone.has(ctxContext)) &&
              internalAdapter?.updateSession &&
              opts.onInitialLocationPin
            ) {
              if (ctxContext) locationPinDone.set(ctxContext, { done: true });
              try {
                const initialLocationId = await opts.onInitialLocationPin(
                  session.userId,
                  session.activeOrganizationId,
                );
                if (initialLocationId !== null) {
                  await internalAdapter.updateSession(session.token, {
                    activeLocationId: initialLocationId,
                  });
                }
              } catch (err) {
                new Logger('IdentityEventHook').error(
                  { err, userId: session.userId, tenantId: session.activeOrganizationId },
                  'Failed to set initial activeLocationId on org-switch',
                );
              }
            }

            if (opts.onActiveTenantSet) {
              try {
                const reqHeaders = rawRequest?.headers;
                await opts.onActiveTenantSet(
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
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (path.endsWith('/sign-up/email')) {
          // D-29: close the public route while keeping `auth.api.signUpEmail`
          // working for server-side callers (bootstrap-owner.service.ts).
          // `ctx.request` is only populated when BA's own web-standard
          // handler routes a real HTTP request (better-call router.mjs);
          // direct `auth.api.*` calls never pass one — confirmed against BA's
          // own crud-invites.mjs, which uses the identical truthy check to
          // distinguish client vs. server calls.
          if (!ctx.request) return;
          const body = (ctx.body ?? {}) as { email?: unknown };
          const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
          const hasValidInvitation =
            email.length > 0 &&
            (
              await opts.authDb.db
                .select({ id: invitationTable.id })
                .from(invitationTable)
                .where(
                  and(
                    eq(invitationTable.email, email),
                    eq(invitationTable.status, 'pending'),
                    gt(invitationTable.expiresAt, new Date()),
                  ),
                )
                .limit(1)
            ).length > 0;
          if (!hasValidInvitation) {
            throw new APIError('FORBIDDEN', {
              code: 'signup.direct_disabled',
              message: 'Direct signup is disabled. Create an account via POST /v1/signup.',
            });
          }
          return;
        }
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
          signOutStash.set(ctx.context, {
            userId: found.user.id,
            tenantId: activeOrgId,
            sessionId: found.session.id,
          });
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
          passwordResetStash.set(ctx.context, {
            userId,
            sessionCount,
          });
        }
        // D-16 (08.3): stash actor for afterUpdateMemberRole actorUserId capture
        if (path.endsWith('/update-member-role')) {
          const token = await ctx
            .getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)
            .catch(() => null);
          if (!token) return;
          const found = await ctx.context.internalAdapter.findSession(token).catch(() => null);
          if (!found) return;
          memberRoleUpdateStash.set(ctx.context, { actorUserId: found.user.id });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        if (path.endsWith('/sign-out')) {
          if (!opts.onSignedOut) return;
          const stash = signOutStash.get(ctx.context);
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
          const stash = passwordResetStash.get(ctx.context);
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
