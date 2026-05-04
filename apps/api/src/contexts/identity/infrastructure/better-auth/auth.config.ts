import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { organization, twoFactor, bearer } from 'better-auth/plugins';
import type { OrganizationOptions } from 'better-auth/plugins';
import { ac, ownerRole, adminRole, staffRole } from './access-control';
import { buildBetterAuthDrizzleAdapter } from './drizzle-adapter';
import type { AuthDrizzle } from './auth-db';

type SendInvitationEmail = NonNullable<OrganizationOptions['sendInvitationEmail']>;

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
}

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
