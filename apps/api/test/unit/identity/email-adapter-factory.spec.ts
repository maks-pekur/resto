import { describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb } from '@resto/db';
import type { Env } from '../../../src/config/env.schema';
import {
  createEmailAdapter,
  DUMMY_RESEND_API_KEY,
  EmailAdapterFactoryError,
  isResendEmailAdapter,
} from '../../../src/contexts/identity/infrastructure/email/email-adapter.factory';
import { CapturedEmailAdapter } from '../../../src/contexts/identity/infrastructure/email/captured.adapter';
import { MailhogSmtpAdapter } from '../../../src/contexts/identity/infrastructure/email/mailhog-smtp.adapter';
import { ResendEmailAdapter } from '../../../src/contexts/identity/infrastructure/email/resend.adapter';

// Mock nodemailer so MailhogSmtpAdapter constructor doesn't open a TCP connection.
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn(), verify: vi.fn() })),
}));

const baseEnv: Env = {
  NODE_ENV: 'development',
  RESEND_FROM: 'RestOS <noreply@resto.app>',
  RESEND_REPLY_TO: 'support@resto.app',
  MAILHOG_HOST: 'localhost',
  MAILHOG_PORT: 1025,
} as unknown as Env;

const stubDb = {} as TenantAwareDb;

describe('createEmailAdapter (D-01)', () => {
  it('NODE_ENV=development → MailhogSmtpAdapter', () => {
    const a = createEmailAdapter({ ...baseEnv, NODE_ENV: 'development' }, { db: stubDb });
    expect(a).toBeInstanceOf(MailhogSmtpAdapter);
    expect(a.adapterName).toBe('mailhog-smtp');
  });

  it('NODE_ENV=test → CapturedEmailAdapter', () => {
    const a = createEmailAdapter({ ...baseEnv, NODE_ENV: 'test' }, { db: stubDb });
    expect(a).toBeInstanceOf(CapturedEmailAdapter);
    expect(a.adapterName).toBe('captured');
  });

  it('NODE_ENV=staging with valid RESEND_API_KEY → ResendEmailAdapter', () => {
    const a = createEmailAdapter(
      { ...baseEnv, NODE_ENV: 'staging', RESEND_API_KEY: 're_real_key_xyz' },
      { db: stubDb },
    );
    expect(a).toBeInstanceOf(ResendEmailAdapter);
    expect(a.adapterName).toBe('resend');
  });

  it('NODE_ENV=production with valid RESEND_API_KEY → ResendEmailAdapter', () => {
    const a = createEmailAdapter(
      { ...baseEnv, NODE_ENV: 'production', RESEND_API_KEY: 're_real_key_xyz' },
      { db: stubDb },
    );
    expect(a).toBeInstanceOf(ResendEmailAdapter);
  });

  it('NODE_ENV=staging without RESEND_API_KEY → throws EmailAdapterFactoryError', () => {
    expect(() =>
      createEmailAdapter({ ...baseEnv, NODE_ENV: 'staging' }, { db: stubDb }),
    ).toThrowError(EmailAdapterFactoryError);
    expect(() => createEmailAdapter({ ...baseEnv, NODE_ENV: 'staging' }, { db: stubDb })).toThrow(
      /RESEND_API_KEY required/,
    );
  });

  it('NODE_ENV=production without RESEND_API_KEY → throws', () => {
    expect(() =>
      createEmailAdapter({ ...baseEnv, NODE_ENV: 'production' }, { db: stubDb }),
    ).toThrow(/RESEND_API_KEY required/);
  });

  it('NODE_ENV=staging with whitespace-only RESEND_API_KEY → throws', () => {
    expect(() =>
      createEmailAdapter(
        { ...baseEnv, NODE_ENV: 'staging', RESEND_API_KEY: '   ' },
        { db: stubDb },
      ),
    ).toThrow(/RESEND_API_KEY required/);
  });

  it('NODE_ENV=staging with dummy RESEND_API_KEY literal → throws (Skeptic HIGH-2)', () => {
    expect(() =>
      createEmailAdapter(
        { ...baseEnv, NODE_ENV: 'staging', RESEND_API_KEY: DUMMY_RESEND_API_KEY },
        { db: stubDb },
      ),
    ).toThrow(/dummy/);
  });

  it('NODE_ENV=production with dummy RESEND_API_KEY literal → throws (Skeptic HIGH-2)', () => {
    expect(() =>
      createEmailAdapter(
        { ...baseEnv, NODE_ENV: 'production', RESEND_API_KEY: DUMMY_RESEND_API_KEY },
        { db: stubDb },
      ),
    ).toThrow(/dummy/);
  });

  it('isResendEmailAdapter type-guard distinguishes Resend from MailHog/Captured', () => {
    const r = createEmailAdapter(
      { ...baseEnv, NODE_ENV: 'staging', RESEND_API_KEY: 're_x' },
      { db: stubDb },
    );
    const m = createEmailAdapter({ ...baseEnv, NODE_ENV: 'development' }, { db: stubDb });
    const c = createEmailAdapter({ ...baseEnv, NODE_ENV: 'test' }, { db: stubDb });
    expect(isResendEmailAdapter(r)).toBe(true);
    expect(isResendEmailAdapter(m)).toBe(false);
    expect(isResendEmailAdapter(c)).toBe(false);
  });
});
