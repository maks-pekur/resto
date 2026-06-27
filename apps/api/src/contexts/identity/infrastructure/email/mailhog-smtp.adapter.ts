import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { Env } from '../../../../config/env.schema';
import type {
  EmailAdapterPort,
  SendGuestNotificationInput,
  SendInvitationInput,
  SendResetPasswordInput,
  SendVerificationInput,
} from '../../domain/ports';
import { renderGuestEmail } from '../../../../contexts/notifications/infrastructure/guest-email-templates';
import {
  invitationBody as invitationBodyEn,
  invitationSubject as invitationSubjectEn,
  resetBody as resetBodyEn,
  resetSubject as resetSubjectEn,
  verificationBody as verificationBodyEn,
  verificationSubject as verificationSubjectEn,
} from './email-strings.en';
import {
  invitationBody as invitationBodyRu,
  invitationSubject as invitationSubjectRu,
  resetBody as resetBodyRu,
  resetSubject as resetSubjectRu,
  verificationBody as verificationBodyRu,
  verificationSubject as verificationSubjectRu,
} from './email-strings.ru';

interface EmailLocaleStrings {
  invitationSubject: string;
  invitationBody: string;
  resetSubject: string;
  resetBody: string;
  verificationSubject: string;
  verificationBody: string;
}

const STRINGS: Record<'en' | 'ru', EmailLocaleStrings> = {
  en: {
    invitationSubject: invitationSubjectEn,
    invitationBody: invitationBodyEn,
    resetSubject: resetSubjectEn,
    resetBody: resetBodyEn,
    verificationSubject: verificationSubjectEn,
    verificationBody: verificationBodyEn,
  },
  ru: {
    invitationSubject: invitationSubjectRu,
    invitationBody: invitationBodyRu,
    resetSubject: resetSubjectRu,
    resetBody: resetBodyRu,
    verificationSubject: verificationSubjectRu,
    verificationBody: verificationBodyRu,
  },
};

const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => vars[key] ?? '');

/**
 * Dev-only adapter dialed by the factory when `NODE_ENV=development`. Sends
 * plain-text email to MailHog (`http://localhost:8025` UI; SMTP on `:1025`)
 * via nodemailer. No retry — MailHog never "fails" meaningfully in dev; if
 * the host is down the dev should see the error in their console and
 * `docker compose up mailhog`.
 *
 * D-15: `verifyTransport()` runs nodemailer's `transport.verify()` which
 * opens a TCP connection + STARTTLS capability check. Surfaces "no MailHog
 * running" loudly at boot.
 *
 * D-17: no outbox emission — failures in dev surface as immediate stderr;
 * the audit row family is the production failure-tracking path.
 */
export class MailhogSmtpAdapter implements EmailAdapterPort {
  readonly adapterName = 'mailhog-smtp' as const;

  readonly #transport: Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;
  readonly #from: string;
  readonly #replyTo: string;
  readonly #logger: Logger;

  constructor(env: Pick<Env, 'MAILHOG_HOST' | 'MAILHOG_PORT' | 'RESEND_FROM' | 'RESEND_REPLY_TO'>) {
    this.#transport = createTransport({
      host: env.MAILHOG_HOST,
      port: env.MAILHOG_PORT,
      secure: false,
      ignoreTLS: true,
    });
    this.#from = env.RESEND_FROM;
    this.#replyTo = env.RESEND_REPLY_TO;
    this.#logger = new Logger('MailhogSmtpAdapter');
  }

  async sendInvitation(input: SendInvitationInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const body = fill(strings.invitationBody, {
      url: input.url,
      tenantSlug: input.tenantSlug,
      inviterName: input.inviterName,
    });
    await this.#send({ to: input.to, subject: strings.invitationSubject, text: body });
  }

  async sendResetPassword(input: SendResetPasswordInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const body = fill(strings.resetBody, { url: input.url });
    await this.#send({ to: input.to, subject: strings.resetSubject, text: body });
  }

  async sendVerification(input: SendVerificationInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const body = fill(strings.verificationBody, { url: input.url });
    await this.#send({ to: input.to, subject: strings.verificationSubject, text: body });
  }

  async sendGuestNotification(input: SendGuestNotificationInput): Promise<void> {
    const rendered = renderGuestEmail(
      input.kind,
      input.locale,
      input.brandTheme,
      input.brandName,
      input.vars,
    );
    await this.#send({
      to: input.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }

  async verifyTransport(): Promise<void> {
    await this.#transport.verify();
  }

  async #send(opts: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    this.#logger.log(
      { adapterName: this.adapterName, to: opts.to, subject: opts.subject },
      'MailHog email send',
    );
    await this.#transport.sendMail({
      from: this.#from,
      to: opts.to,
      replyTo: this.#replyTo,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html !== undefined ? { html: opts.html } : {}),
    });
  }
}
