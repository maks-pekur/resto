import type {
  EmailAdapterPort,
  SendInvitationInput,
  SendResetPasswordInput,
  SendVerificationInput,
} from '../../domain/ports';

/**
 * Captured email record — what was attempted, not what was sent. Used by
 * tests to assert that the BA flow produced the correct email payload
 * without round-tripping through Resend / MailHog.
 */
export type CapturedEmail =
  | ({ readonly kind: 'invitation' } & SendInvitationInput)
  | ({ readonly kind: 'reset-password' } & SendResetPasswordInput)
  | ({ readonly kind: 'verification' } & SendVerificationInput);

/**
 * `NODE_ENV=test` adapter — never leaves the process. The factory at
 * composition root picks this when running under vitest so tests can
 * assert on `getCaptured()` instead of dialing MailHog or Resend.
 *
 * D-15: `verifyTransport()` is a no-op (nothing to ping). The
 * `assertEmailAdapterWired` boot guard skips the transport ping for
 * NODE_ENV='test' for the same reason.
 *
 * D-17: no `runInTenantContext`, no outbox emission — this adapter does
 * not write to any database.
 */
export class CapturedEmailAdapter implements EmailAdapterPort {
  readonly adapterName = 'captured' as const;

  readonly #queue: CapturedEmail[] = [];

  sendInvitation(input: SendInvitationInput): Promise<void> {
    this.#queue.push({ kind: 'invitation', ...input });
    return Promise.resolve();
  }

  sendResetPassword(input: SendResetPasswordInput): Promise<void> {
    this.#queue.push({ kind: 'reset-password', ...input });
    return Promise.resolve();
  }

  sendVerification(input: SendVerificationInput): Promise<void> {
    this.#queue.push({ kind: 'verification', ...input });
    return Promise.resolve();
  }

  verifyTransport(): Promise<void> {
    return Promise.resolve();
  }

  /** Read-only snapshot of all captured emails (for test assertions). */
  getCaptured(): readonly CapturedEmail[] {
    return [...this.#queue];
  }

  /** Drain the queue between tests. */
  clear(): void {
    this.#queue.length = 0;
  }
}
