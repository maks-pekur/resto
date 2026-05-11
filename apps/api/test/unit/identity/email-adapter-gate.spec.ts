import { describe, expect, it } from 'vitest';
import { assertEmailAdapterWired } from '../../../src/contexts/identity/identity-core.module';

const noopReset = (): Promise<void> => Promise.resolve();
const noopInvite = (): Promise<void> => Promise.resolve();
const noopVerify = (): Promise<void> => Promise.resolve();

describe('assertEmailAdapterWired', () => {
  it('passes in development with no callbacks', () => {
    expect(() => assertEmailAdapterWired('development', {})).not.toThrow();
  });

  it('passes in test with no callbacks', () => {
    expect(() => assertEmailAdapterWired('test', {})).not.toThrow();
  });

  it('throws in production when both callbacks are missing', () => {
    expect(() => assertEmailAdapterWired('production', {})).toThrowError(
      /sendResetPassword.*sendInvitationEmail.*sendVerificationEmail/,
    );
  });

  it('throws in staging when both callbacks are missing', () => {
    expect(() => assertEmailAdapterWired('staging', {})).toThrowError(/NODE_ENV=staging/);
  });

  it('throws in production naming only the missing callbacks', () => {
    expect(() =>
      assertEmailAdapterWired('production', { sendResetPassword: noopReset }),
    ).toThrowError(/missing sendInvitationEmail, sendVerificationEmail/);
  });

  it('passes in production when all three callbacks are provided', () => {
    expect(() =>
      assertEmailAdapterWired('production', {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
        sendVerificationEmail: noopVerify,
      }),
    ).not.toThrow();
  });

  it('throws in production when sendVerificationEmail is missing (RES-184)', () => {
    expect(() =>
      assertEmailAdapterWired('production', {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
      }),
    ).toThrowError(/missing sendVerificationEmail/);
  });

  it('throw message points to RES-12 for the email adapter ticket', () => {
    expect(() => assertEmailAdapterWired('production', {})).toThrowError(/RES-12/);
  });
});
