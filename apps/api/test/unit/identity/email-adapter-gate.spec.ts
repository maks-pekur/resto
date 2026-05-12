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

  it('throws in production when sendVerificationEmail is missing', () => {
    expect(() => assertEmailAdapterWired('production', {})).toThrowError(
      /missing sendVerificationEmail/,
    );
  });

  it('throws in staging when sendVerificationEmail is missing', () => {
    expect(() => assertEmailAdapterWired('staging', {})).toThrowError(/NODE_ENV=staging/);
  });

  it('still throws in production when only sendResetPassword is wired', () => {
    expect(() =>
      assertEmailAdapterWired('production', { sendResetPassword: noopReset }),
    ).toThrowError(/missing sendVerificationEmail/);
  });

  it('passes in production when sendVerificationEmail is wired (RES-187)', () => {
    expect(() =>
      assertEmailAdapterWired('production', { sendVerificationEmail: noopVerify }),
    ).not.toThrow();
  });

  it('passes in production when all three callbacks are wired', () => {
    expect(() =>
      assertEmailAdapterWired('production', {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
        sendVerificationEmail: noopVerify,
      }),
    ).not.toThrow();
  });

  it('throws in production when sendVerificationEmail is missing even if other callbacks are wired (RES-184)', () => {
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
