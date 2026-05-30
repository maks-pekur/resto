import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TenantId } from '@resto/domain';

interface SentMailOpts {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

const sendMail = vi.fn(
  (_opts: SentMailOpts): Promise<{ messageId: string }> => Promise.resolve({ messageId: 'mid' }),
);
const verify = vi.fn((): Promise<true> => Promise.resolve(true));

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail, verify })),
}));

const { MailhogSmtpAdapter } =
  await import('../../../src/contexts/identity/infrastructure/email/mailhog-smtp.adapter');
const nodemailer = await import('nodemailer');

const envFixture = {
  MAILHOG_HOST: 'localhost',
  MAILHOG_PORT: 1025,
  RESEND_FROM: 'RestOS <noreply@resto.app>',
  RESEND_REPLY_TO: 'support@resto.app',
};

const tid = TenantId.parse('22222222-2222-2222-2222-222222222222');

describe('MailhogSmtpAdapter', () => {
  beforeEach(() => {
    sendMail.mockClear();
    verify.mockClear();
    vi.mocked(nodemailer.createTransport).mockClear();
  });

  it('adapterName is mailhog-smtp', () => {
    expect(new MailhogSmtpAdapter(envFixture).adapterName).toBe('mailhog-smtp');
  });

  it('createTransport called with host/port from env, secure=false, ignoreTLS=true', () => {
    new MailhogSmtpAdapter(envFixture);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      ignoreTLS: true,
    });
  });

  it('sendInvitation passes the EN body with placeholder substitution', async () => {
    const a = new MailhogSmtpAdapter(envFixture);
    await a.sendInvitation({
      to: 'invitee@example.com',
      locale: 'en',
      url: 'https://admin.resto.app/accept/abc',
      tenantSlug: 'acme',
      inviterName: 'Alice',
      tenantId: tid,
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0]?.[0];
    expect(call?.from).toBe('RestOS <noreply@resto.app>');
    expect(call?.to).toBe('invitee@example.com');
    expect(call?.replyTo).toBe('support@resto.app');
    expect(call?.subject).toBe('You are invited to RestOS');
    expect(call?.text).toContain('Alice');
    expect(call?.text).toContain('acme');
    expect(call?.text).toContain('https://admin.resto.app/accept/abc');
  });

  it('sendInvitation with RU locale uses Russian copy', async () => {
    const a = new MailhogSmtpAdapter(envFixture);
    await a.sendInvitation({
      to: 'invitee@example.com',
      locale: 'ru',
      url: 'https://admin.resto.app/accept/abc',
      tenantSlug: 'acme',
      inviterName: 'Алиса',
      tenantId: tid,
    });
    const call = sendMail.mock.calls[0]?.[0];
    expect(call?.subject).toBe('Приглашение в RestOS');
    expect(call?.text).toContain('Алиса');
  });

  it('sendResetPassword interpolates {{url}}', async () => {
    const a = new MailhogSmtpAdapter(envFixture);
    await a.sendResetPassword({
      to: 'u@example.com',
      locale: 'en',
      url: 'https://admin.resto.app/reset/zzz',
      userId: 'u-1',
    });
    const call = sendMail.mock.calls[0]?.[0];
    expect(call?.subject).toBe('Reset your RestOS password');
    expect(call?.text).toContain('https://admin.resto.app/reset/zzz');
  });

  it('sendVerification interpolates {{url}}', async () => {
    const a = new MailhogSmtpAdapter(envFixture);
    await a.sendVerification({
      to: 'u@example.com',
      locale: 'en',
      url: 'https://admin.resto.app/verify/aaa',
      userId: 'u-1',
    });
    const call = sendMail.mock.calls[0]?.[0];
    expect(call?.subject).toBe('Verify your RestOS email');
    expect(call?.text).toContain('https://admin.resto.app/verify/aaa');
  });

  it('verifyTransport delegates to nodemailer transport.verify()', async () => {
    const a = new MailhogSmtpAdapter(envFixture);
    await a.verifyTransport();
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('verifyTransport propagates the underlying nodemailer error (D-15)', async () => {
    verify.mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:1025'));
    const a = new MailhogSmtpAdapter(envFixture);
    await expect(a.verifyTransport()).rejects.toThrow(/ECONNREFUSED/);
  });
});
