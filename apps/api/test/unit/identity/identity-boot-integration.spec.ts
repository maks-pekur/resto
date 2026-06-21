import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../src/config/env.schema';
import {
  assertProdGuardrails,
  DUMMY_RESEND_API_KEY_LITERAL,
  ProdGuardrailsError,
} from '../../../src/config/prod-guardrails';
import { createEmailAdapter } from '../../../src/contexts/identity/infrastructure/email/email-adapter.factory';
import type { TenantAwareDb } from '@resto/db';

// Stub nodemailer + Resend SDK so the factory doesn't reach out at boot.
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn(), verify: vi.fn() })),
}));
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: vi.fn() },
    domains: { list: vi.fn() },
  })),
}));

const stubDb = {} as TenantAwareDb;

const buildProdEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'production',
    S3_ENDPOINT: 'https://s3.amazonaws.com',
    S3_ACCESS_KEY: 'prod-access',
    S3_SECRET_KEY: 'prod-secret-value-32-chars-padding-aaa',
    AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
    BETTER_AUTH_SECRET: 'production-better-auth-secret-32chars-min',
    INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    RESEND_API_KEY: 're_real_production_key_xyz',
    RESEND_FROM: 'RestOS <noreply@resto.app>',
    RESEND_REPLY_TO: 'support@resto.app',
    MAILHOG_HOST: 'localhost',
    MAILHOG_PORT: 1025,
    ...overrides,
  }) as Env;

/**
 * D-14 boot-time integration test: prove the misconfiguration regression
 * is caught at MODULE construction (synchronously throwing in the factory)
 * NOT later when BA tries to dispatch an email. This is the bug class
 * Skeptic HIGH-1 and CTO HIGH-2 converged on as "most dangerous false-
 * positive in the codebase" — we get one regression test for the entire
 * email-misconfig family.
 */
describe('Plan 03-02 D-14: boot-time email-adapter misconfiguration regression', () => {
  it('staging WITHOUT RESEND_API_KEY → assertProdGuardrails throws synchronously', () => {
    const env = buildProdEnv({
      NODE_ENV: 'staging',
      RESEND_API_KEY: undefined as unknown as string,
    });
    expect(() => assertProdGuardrails(env)).toThrow(ProdGuardrailsError);
    expect(() => assertProdGuardrails(env)).toThrow(/RESEND_API_KEY is required/);
  });

  it('production WITHOUT RESEND_API_KEY → assertProdGuardrails throws synchronously', () => {
    const env = buildProdEnv({ RESEND_API_KEY: undefined as unknown as string });
    expect(() => assertProdGuardrails(env)).toThrow(/RESEND_API_KEY is required/);
  });

  it('production with DUMMY RESEND_API_KEY → assertProdGuardrails throws synchronously', () => {
    const env = buildProdEnv({ RESEND_API_KEY: DUMMY_RESEND_API_KEY_LITERAL });
    expect(() => assertProdGuardrails(env)).toThrow(/dummy literal/);
  });

  it('production without RESEND_API_KEY → createEmailAdapter ALSO throws (defense-in-depth)', () => {
    // Second-line gate: even if assertProdGuardrails is somehow bypassed,
    // the factory itself refuses to construct a Resend adapter without a
    // real key. Belt + suspenders for D-13 "loud failure mode".
    const env = buildProdEnv({ RESEND_API_KEY: undefined as unknown as string });
    expect(() => createEmailAdapter(env, { db: stubDb })).toThrow(/RESEND_API_KEY required/);
  });

  it('production with dummy RESEND_API_KEY → createEmailAdapter ALSO throws (defense-in-depth)', () => {
    const env = buildProdEnv({ RESEND_API_KEY: DUMMY_RESEND_API_KEY_LITERAL });
    expect(() => createEmailAdapter(env, { db: stubDb })).toThrow(/dummy/);
  });

  it('main.ts boot order: assertProdGuardrails(env) runs BEFORE createEmailAdapter → operator sees ProdGuardrailsError, not a DI exception', () => {
    // We exercise the actual order main.ts runs in: first the env-only
    // guardrails check, then (only on success) the adapter construction.
    // This locks in the failure-message contract: an operator sees
    // "RESEND_API_KEY is required" not "Cannot resolve provider
    // EMAIL_ADAPTER_PORT".
    const env = buildProdEnv({ RESEND_API_KEY: undefined as unknown as string });
    let thrown: unknown;
    try {
      assertProdGuardrails(env);
      createEmailAdapter(env, { db: stubDb });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ProdGuardrailsError);
    expect((thrown as Error).message).toMatch(/RESEND_API_KEY is required/);
  });

  it('happy path: staging with real key + adapterName=resend → assertProdGuardrails passes', () => {
    const env = buildProdEnv({ NODE_ENV: 'staging' });
    expect(() => assertProdGuardrails(env, { emailAdapterName: 'resend' })).not.toThrow();
  });

  it('happy path: development boots without RESEND_API_KEY (factory picks MailHog)', () => {
    const env = buildProdEnv({
      NODE_ENV: 'development',
      RESEND_API_KEY: undefined as unknown as string,
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
    const a = createEmailAdapter(env, { db: stubDb });
    expect(a.adapterName).toBe('mailhog-smtp');
  });

  it('happy path: test boots without RESEND_API_KEY (factory picks Captured)', () => {
    const env = buildProdEnv({
      NODE_ENV: 'test',
      RESEND_API_KEY: undefined as unknown as string,
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
    const a = createEmailAdapter(env, { db: stubDb });
    expect(a.adapterName).toBe('captured');
  });
});
