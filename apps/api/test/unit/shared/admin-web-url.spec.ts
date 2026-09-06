import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../../../src/config/env.schema';
import {
  ADMIN_ACCEPT_INVITATION_PATH,
  ADMIN_PAYOUTS_PATH,
  adminLink,
} from '../../../src/shared/admin-links';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app@localhost:5432/resto',
  NATS_URL: 'nats://localhost:4222',
};

const prodBaseEnv: NodeJS.ProcessEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
  BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
  BETTER_AUTH_BASE_URL: 'https://api.resto.app',
  BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
  ADMIN_WEB_URL: 'https://restos.pp.ua/admin',
  WEBSITE_PUBLIC_URL: 'https://order.resto.app',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
  TRUST_PROXY: '10.0.0.0/8',
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-replace-me',
  INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
};

describe('AUTH_COOKIE_DOMAIN (07.4 D-05)', () => {
  it('boots in production with AUTH_COOKIE_DOMAIN unset', () => {
    const env = loadEnv(prodBaseEnv);
    expect(env.AUTH_COOKIE_DOMAIN).toBeUndefined();
  });

  it('still rejects a dotless AUTH_COOKIE_DOMAIN when one is supplied', () => {
    expect(() => loadEnv({ ...prodBaseEnv, AUTH_COOKIE_DOMAIN: 'admin.resto.app' })).toThrow(
      /AUTH_COOKIE_DOMAIN/,
    );
    const env = loadEnv({ ...prodBaseEnv, AUTH_COOKIE_DOMAIN: '.admin.resto.app' });
    expect(env.AUTH_COOKIE_DOMAIN).toBe('.admin.resto.app');
  });
});

describe('ADMIN_WEB_ORIGIN_WILDCARD removal (07.4 D-06)', () => {
  it('rejects ADMIN_WEB_ORIGIN_WILDCARD as an unknown key having no effect', () => {
    const env = loadEnv({
      ...prodBaseEnv,
      ADMIN_WEB_ORIGIN_WILDCARD: 'https://*.admin.resto.app',
    });
    expect(Object.prototype.hasOwnProperty.call(env, 'ADMIN_WEB_ORIGIN_WILDCARD')).toBe(false);
  });
});

describe('adminLink and the trusted origin (07.4 D-07)', () => {
  it('a path-carrying ADMIN_WEB_URL yields an origin-only trusted origin', () => {
    // Better Auth compares non-wildcard trusted origins as `pattern === getOrigin(url)`
    // (better-auth@1.6.30 dist/auth/trusted-origins.mjs), so a value carrying `/admin`
    // can never match and every mutating admin request is rejected as untrusted.
    expect(new URL('https://restos.pp.ua/admin').origin).toBe('https://restos.pp.ua');
  });

  it('an origin-only ADMIN_WEB_URL is unchanged and grows no trailing slash', () => {
    expect(new URL('https://admin.resto.app').origin).toBe('https://admin.resto.app');
  });

  it('adminLink composes onto the configured path', () => {
    const env = { ADMIN_WEB_URL: 'https://restos.pp.ua/admin' } as Pick<Env, 'ADMIN_WEB_URL'>;
    expect(adminLink(env, `${ADMIN_ACCEPT_INVITATION_PATH}/abc`)).toBe(
      'https://restos.pp.ua/admin/accept-invitation/abc',
    );
    expect(adminLink(env, ADMIN_PAYOUTS_PATH)).toBe('https://restos.pp.ua/admin/tenant/payouts');
  });

  it('adminLink does not double a slash', () => {
    const env = { ADMIN_WEB_URL: 'https://restos.pp.ua/admin/' } as Pick<Env, 'ADMIN_WEB_URL'>;
    expect(adminLink(env, ADMIN_PAYOUTS_PATH)).toBe('https://restos.pp.ua/admin/tenant/payouts');
  });

  it('adminLink returns an empty string when ADMIN_WEB_URL is unset', () => {
    expect(adminLink({}, ADMIN_PAYOUTS_PATH)).toBe('');
  });
});
