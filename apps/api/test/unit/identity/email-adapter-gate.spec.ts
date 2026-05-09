import { describe, expect, it } from 'vitest';
import { assertEmailAdapterWired } from '../../../src/contexts/identity/identity-core.module';

const noopReset = (): Promise<void> => Promise.resolve();
const noopInvite = (): Promise<void> => Promise.resolve();

describe('assertEmailAdapterWired', () => {
  it('passes in development with no callbacks', () => {
    expect(() => assertEmailAdapterWired('development', {})).not.toThrow();
  });

  it('passes in test with no callbacks', () => {
    expect(() => assertEmailAdapterWired('test', {})).not.toThrow();
  });

  it('throws in production when both callbacks are missing', () => {
    expect(() => assertEmailAdapterWired('production', {})).toThrowError(
      /sendResetPassword.*sendInvitationEmail/,
    );
  });

  it('throws in staging when both callbacks are missing', () => {
    expect(() => assertEmailAdapterWired('staging', {})).toThrowError(/NODE_ENV=staging/);
  });

  it('throws in production naming only the missing callback', () => {
    expect(() =>
      assertEmailAdapterWired('production', { sendResetPassword: noopReset }),
    ).toThrowError(/missing sendInvitationEmail/);
  });

  it('passes in production when both callbacks are provided', () => {
    expect(() =>
      assertEmailAdapterWired('production', {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
      }),
    ).not.toThrow();
  });

  it('throw message points to RES-12 for the email adapter ticket', () => {
    expect(() => assertEmailAdapterWired('production', {})).toThrowError(/RES-12/);
  });
});
