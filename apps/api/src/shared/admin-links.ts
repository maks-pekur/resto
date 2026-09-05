import type { Env } from '../config/env.schema';

export const ADMIN_ACCEPT_INVITATION_PATH = '/accept-invitation';
export const ADMIN_PAYOUTS_PATH = '/tenant/payouts';

/**
 * 07.4 D-07: `ADMIN_WEB_URL` carries the admin's base path (`https://<apex>/admin`), so every
 * emitted deep link composes onto it here rather than at the call site. Returns `''` when unset,
 * preserving the `?? ''` behaviour the callers had.
 */
export const adminLink = (env: Pick<Env, 'ADMIN_WEB_URL'>, path: string): string => {
  const base = env.ADMIN_WEB_URL;
  if (!base) return '';
  return `${base.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
};

/**
 * The admin's origin with no path. Better Auth compares a non-wildcard trusted origin as
 * `pattern === getOrigin(url)` (better-auth@1.6.30 `dist/auth/trusted-origins.mjs`), so pushing
 * `ADMIN_WEB_URL` itself — which carries `/admin` — could never match, and every mutating admin
 * request would be rejected as untrusted.
 */
export const adminOrigin = (env: Pick<Env, 'ADMIN_WEB_URL'>): string =>
  env.ADMIN_WEB_URL ? new URL(env.ADMIN_WEB_URL).origin : '';
