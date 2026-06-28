import { describe, expect, it } from 'vitest';
import {
  assertEmailAdapterWired,
  REQUIRED_EMAIL_CALLBACKS,
} from '../../../src/contexts/identity/identity-core.module';
import type { EmailAdapterPort } from '../../../src/contexts/identity/domain/ports';

const noopReset = (): Promise<void> => Promise.resolve();
const noopInvite = (): Promise<void> => Promise.resolve();
const noopVerify = (): Promise<void> => Promise.resolve();

const okAdapter: EmailAdapterPort = {
  adapterName: 'resend',
  sendInvitation: () => Promise.resolve(),
  sendResetPassword: () => Promise.resolve(),
  sendVerification: () => Promise.resolve(),
  sendGuestNotification: () => Promise.resolve(),
  verifyTransport: () => Promise.resolve(),
};

describe('assertEmailAdapterWired (D-13)', () => {
  it('REQUIRED_EMAIL_CALLBACKS now lists all three (D-13 closes the false-positive)', () => {
    expect(REQUIRED_EMAIL_CALLBACKS).toEqual([
      'sendVerificationEmail',
      'sendResetPassword',
      'sendInvitationEmail',
    ]);
  });

  it('passes in development with no callbacks', async () => {
    await expect(assertEmailAdapterWired('development', {})).resolves.toBeUndefined();
  });

  it('passes in test with no callbacks', async () => {
    await expect(assertEmailAdapterWired('test', {})).resolves.toBeUndefined();
  });

  it('throws in production when sendVerificationEmail is missing', async () => {
    await expect(assertEmailAdapterWired('production', {})).rejects.toThrow(
      /missing.*sendVerificationEmail/,
    );
  });

  it('throws in staging when callbacks are missing', async () => {
    await expect(assertEmailAdapterWired('staging', {})).rejects.toThrow(/NODE_ENV=staging/);
  });

  it('still throws in production when only sendResetPassword is wired (D-13)', async () => {
    await expect(
      assertEmailAdapterWired('production', { sendResetPassword: noopReset }),
    ).rejects.toThrow(/missing/);
  });

  it('D-13: throws in production when only sendVerificationEmail is wired (sendResetPassword + sendInvitationEmail still missing)', async () => {
    await expect(
      assertEmailAdapterWired('production', { sendVerificationEmail: noopVerify }),
    ).rejects.toThrow(/sendResetPassword|sendInvitationEmail/);
  });

  it('passes in production when all three callbacks are wired', async () => {
    await expect(
      assertEmailAdapterWired('production', {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
        sendVerificationEmail: noopVerify,
      }),
    ).resolves.toBeUndefined();
  });

  it('error message points to RES-12 ticket', async () => {
    await expect(assertEmailAdapterWired('production', {})).rejects.toThrow(/RES-12/);
  });

  it('D-15: calls adapter.verifyTransport when adapter supplied in staging', async () => {
    let called = 0;
    const adapter: EmailAdapterPort = {
      ...okAdapter,
      verifyTransport: () => {
        called++;
        return Promise.resolve();
      },
    };
    await assertEmailAdapterWired(
      'staging',
      {
        sendResetPassword: noopReset,
        sendInvitationEmail: noopInvite,
        sendVerificationEmail: noopVerify,
      },
      adapter,
    );
    expect(called).toBe(1);
  });

  it('D-15: rethrows when adapter.verifyTransport rejects', async () => {
    const adapter: EmailAdapterPort = {
      ...okAdapter,
      verifyTransport: () => Promise.reject(new Error('invalid_api_key')),
    };
    await expect(
      assertEmailAdapterWired(
        'production',
        {
          sendResetPassword: noopReset,
          sendInvitationEmail: noopInvite,
          sendVerificationEmail: noopVerify,
        },
        adapter,
      ),
    ).rejects.toThrow(/verifyTransport failed at boot/);
  });

  it('D-15: does NOT call verifyTransport in development even if adapter is supplied', async () => {
    let called = 0;
    const adapter: EmailAdapterPort = {
      ...okAdapter,
      verifyTransport: () => {
        called++;
        return Promise.resolve();
      },
    };
    await assertEmailAdapterWired('development', {}, adapter);
    expect(called).toBe(0);
  });

  it('D-17: structural-type check rejects an adapter missing a method', async () => {
    const broken = {
      adapterName: 'resend',
      sendInvitation: () => Promise.resolve(),
      // sendResetPassword missing!
      sendVerification: () => Promise.resolve(),
      verifyTransport: () => Promise.resolve(),
    } as unknown as EmailAdapterPort;
    await expect(
      assertEmailAdapterWired(
        'production',
        {
          sendResetPassword: noopReset,
          sendInvitationEmail: noopInvite,
          sendVerificationEmail: noopVerify,
        },
        broken,
      ),
    ).rejects.toThrow(/missing method sendResetPassword/);
  });
});
