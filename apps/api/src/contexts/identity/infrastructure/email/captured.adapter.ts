import type {
  EmailAdapterPort,
  SendGuestNotificationInput,
  SendInvitationInput,
  SendResetPasswordInput,
  SendVerificationInput,
} from '../../domain/ports';

export type CapturedEmail =
  | ({ readonly kind: 'invitation' } & SendInvitationInput)
  | ({ readonly kind: 'reset-password' } & SendResetPasswordInput)
  | ({ readonly kind: 'verification' } & SendVerificationInput)
  | { readonly kind: 'guest-notification'; readonly input: SendGuestNotificationInput };

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

  sendGuestNotification(input: SendGuestNotificationInput): Promise<void> {
    this.#queue.push({ kind: 'guest-notification', input });
    return Promise.resolve();
  }

  verifyTransport(): Promise<void> {
    return Promise.resolve();
  }

  getCaptured(): readonly CapturedEmail[] {
    return [...this.#queue];
  }

  clear(): void {
    this.#queue.length = 0;
  }
}
