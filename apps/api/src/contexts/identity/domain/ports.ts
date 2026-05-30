import type { TenantId } from '@resto/domain';
import type { EmailLocale } from './email-locale';

/**
 * Concrete adapter identity for boot-time guard assertions
 * (assertProdGuardrails — D-01). The factory at composition root selects
 * one of the three based on NODE_ENV:
 *   - development  → mailhog-smtp
 *   - test         → captured
 *   - staging/prod → resend
 *
 * Adapter implementations expose this as a readonly literal so the
 * guardrail can refuse boot if e.g. MailHog accidentally wires in prod.
 */
export type EmailAdapterName = 'resend' | 'mailhog-smtp' | 'captured';

export interface SendInvitationInput {
  readonly to: string;
  readonly locale: EmailLocale;
  readonly url: string;
  readonly tenantSlug: string;
  readonly inviterName: string;
  readonly tenantId: TenantId;
}

export interface SendResetPasswordInput {
  readonly to: string;
  readonly locale: EmailLocale;
  readonly url: string;
  readonly userId: string;
  readonly tenantId?: TenantId | undefined;
}

export interface SendVerificationInput {
  readonly to: string;
  readonly locale: EmailLocale;
  readonly url: string;
  readonly userId: string;
  readonly tenantId?: TenantId | undefined;
}

/**
 * EMAIL_ADAPTER_PORT — DI Symbol token wired in `identity-core.module.ts`.
 *
 * The adapter is the single delegation target for Better Auth's three
 * send-callbacks (sendInvitation / sendResetPassword / sendVerification).
 * All three callbacks receive the inviter / user `request?` so the
 * call-site can resolve `Accept-Language` via `getLocale(request?.headers)`.
 *
 * D-17: adapter NEVER calls `runInTenantContext` (ADR-0020 I-6 forbids it
 * outside HTTP middleware). For failure-emission outbox writes the
 * adapter uses `db.withTenantId(tenantId, ...)` when tenantId is known
 * and `db.withoutTenant('email dispatch failure — no tenant context (BA
 * pre-org-bind path)', ...)` otherwise.
 */
export const EMAIL_ADAPTER_PORT = Symbol('EMAIL_ADAPTER_PORT');

export interface EmailAdapterPort {
  /** Identity used by `assertProdGuardrails` to reject MailHog-in-prod. */
  readonly adapterName: EmailAdapterName;

  sendInvitation(input: SendInvitationInput): Promise<void>;
  sendResetPassword(input: SendResetPasswordInput): Promise<void>;
  sendVerification(input: SendVerificationInput): Promise<void>;

  /**
   * Boot-time ping (D-15). Resend → `domains.list()`; nodemailer → SMTP
   * STARTTLS handshake via `transport.verify()`; captured → no-op.
   * Called only when NODE_ENV ∈ {staging, production}.
   */
  verifyTransport(): Promise<void>;
}
