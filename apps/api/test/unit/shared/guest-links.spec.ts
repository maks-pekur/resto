import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../../../src/config/env.schema';
import {
  GUEST_MENU_BASE_PATH,
  GUEST_ORDER_STATUS_PATH,
  guestHostForTenant,
  guestMenuStickerUrl,
  guestOrderStatusUrl,
} from '../../../src/shared/guest-links';

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
  ADMIN_WEB_URL: 'https://resto.app/admin',
  WEBSITE_PUBLIC_URL: 'https://resto.app',
  PUBLIC_APEX_DOMAIN: 'resto.app',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
  TRUST_PROXY: '10.0.0.0/8',
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-replace-me',
  INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
};

describe('guestHostForTenant', () => {
  const env = { PUBLIC_APEX_DOMAIN: 'resto.app' } as Pick<Env, 'PUBLIC_APEX_DOMAIN'>;

  it('returns <slug>.<apex> when there is no primary verified custom domain', () => {
    expect(guestHostForTenant(env, { slug: 'la-bella' }, null)).toBe('la-bella.resto.app');
  });

  it('prefers the primary verified custom domain over the apex', () => {
    expect(guestHostForTenant(env, { slug: 'la-bella' }, 'labella.example.com')).toBe(
      'labella.example.com',
    );
  });

  it('throws, naming the slug, when neither a custom domain nor an apex is configured', () => {
    expect(() =>
      guestHostForTenant({ PUBLIC_APEX_DOMAIN: undefined }, { slug: 'la-bella' }, null),
    ).toThrow(/la-bella/);
  });
});

describe('guestMenuStickerUrl', () => {
  it('carries the /qr base for an apex host', () => {
    expect(guestMenuStickerUrl('la-bella.resto.app', 'abc123')).toBe(
      'https://la-bella.resto.app/qr/t/abc123',
    );
  });

  it('carries the /qr base for a custom-domain host too — the bundle is the same bundle either way', () => {
    expect(guestMenuStickerUrl('labella.example.com', 'abc123')).toBe(
      'https://labella.example.com/qr/t/abc123',
    );
  });
});

describe('guestOrderStatusUrl', () => {
  it('is the storefront root with no /qr', () => {
    const url = guestOrderStatusUrl('la-bella.resto.app', 'order-1');
    expect(url).toBe('https://la-bella.resto.app/checkout/confirmation/order-1');
    expect(url).not.toContain(GUEST_MENU_BASE_PATH);
  });

  it('uses GUEST_ORDER_STATUS_PATH', () => {
    expect(guestOrderStatusUrl('la-bella.resto.app', 'order-1')).toContain(GUEST_ORDER_STATUS_PATH);
  });
});

describe('GUEST_APEX_DOMAIN removal (07.5-13)', () => {
  it('rejects GUEST_APEX_DOMAIN as an unknown key having no effect', () => {
    const env = loadEnv({ ...prodBaseEnv, GUEST_APEX_DOMAIN: 'menu.resto.app' });
    expect(Object.prototype.hasOwnProperty.call(env, 'GUEST_APEX_DOMAIN')).toBe(false);
  });
});
