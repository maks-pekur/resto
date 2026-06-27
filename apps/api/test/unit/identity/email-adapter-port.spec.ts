import { describe, expect, it } from 'vitest';
import {
  EMAIL_ADAPTER_PORT,
  type EmailAdapterPort,
} from '../../../src/contexts/identity/domain/ports';
import {
  SUPPORTED_LOCALES,
  type EmailLocale,
} from '../../../src/contexts/identity/domain/email-locale';

describe('EMAIL_ADAPTER_PORT contract', () => {
  it('exports a Symbol token', () => {
    expect(typeof EMAIL_ADAPTER_PORT).toBe('symbol');
    expect(EMAIL_ADAPTER_PORT.description).toBe('EMAIL_ADAPTER_PORT');
  });

  it('EmailAdapterPort interface admits exactly the four methods + adapterName', () => {
    // Compile-time assertion via a structural stub. Failure to satisfy the
    // interface here means the contract regressed.
    const stub: EmailAdapterPort = {
      adapterName: 'captured',
      sendInvitation: () => Promise.resolve(),
      sendResetPassword: () => Promise.resolve(),
      sendVerification: () => Promise.resolve(),
      sendGuestNotification: () => Promise.resolve(),
      verifyTransport: () => Promise.resolve(),
    };
    expect(stub.adapterName).toBe('captured');
    expect(typeof stub.sendInvitation).toBe('function');
    expect(typeof stub.sendResetPassword).toBe('function');
    expect(typeof stub.sendVerification).toBe('function');
    expect(typeof stub.verifyTransport).toBe('function');
  });

  it('SUPPORTED_LOCALES contains exactly en and ru', () => {
    const locales: readonly EmailLocale[] = SUPPORTED_LOCALES;
    expect(locales).toEqual(['en', 'ru']);
  });
});
