import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.schema';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app@localhost:5432/resto',
  NATS_URL: 'nats://localhost:4222',
};

describe('env.schema — email transport envs (D-01 / D-20)', () => {
  it('RESEND_API_KEY is optional in dev (omitted)', () => {
    const env = loadEnv(baseEnv);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('RESEND_API_KEY parses when set', () => {
    const env = loadEnv({ ...baseEnv, RESEND_API_KEY: 're_test_123' });
    expect(env.RESEND_API_KEY).toBe('re_test_123');
  });

  it('RESEND_FROM defaults to RestOS <noreply@resto.app>', () => {
    const env = loadEnv(baseEnv);
    expect(env.RESEND_FROM).toBe('RestOS <noreply@resto.app>');
  });

  it('RESEND_FROM accepts override', () => {
    const env = loadEnv({ ...baseEnv, RESEND_FROM: 'Resto Test <test@example.com>' });
    expect(env.RESEND_FROM).toBe('Resto Test <test@example.com>');
  });

  it('RESEND_REPLY_TO defaults to support@resto.app', () => {
    const env = loadEnv(baseEnv);
    expect(env.RESEND_REPLY_TO).toBe('support@resto.app');
  });

  it('RESEND_REPLY_TO must be a valid email', () => {
    expect(() => loadEnv({ ...baseEnv, RESEND_REPLY_TO: 'not-an-email' })).toThrow(
      /RESEND_REPLY_TO/,
    );
  });

  it('MAILHOG_HOST defaults to localhost', () => {
    const env = loadEnv(baseEnv);
    expect(env.MAILHOG_HOST).toBe('localhost');
  });

  it('MAILHOG_PORT defaults to 1025 and coerces from string', () => {
    const env = loadEnv(baseEnv);
    expect(env.MAILHOG_PORT).toBe(1025);
    const overridden = loadEnv({ ...baseEnv, MAILHOG_PORT: '2525' });
    expect(overridden.MAILHOG_PORT).toBe(2525);
  });

  it('RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN defaults to 60', () => {
    const env = loadEnv(baseEnv);
    expect(env.RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN).toBe(60);
  });

  it('RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN must be a positive integer', () => {
    expect(() => loadEnv({ ...baseEnv, RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN: '0' })).toThrow(
      /RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN/,
    );
  });
});
