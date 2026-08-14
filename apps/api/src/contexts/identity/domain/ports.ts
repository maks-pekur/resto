import type { TenantId } from '@resto/domain';
import type { EmailLocale } from './email-locale';

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

export type GuestNotificationKind =
  | 'order_confirmation'
  | 'order_refunded'
  | 'order_accepted'
  | 'order_ready';

export interface GuestBrandTheme {
  readonly logoUrl?: string | null | undefined;
  readonly accentColor?: string | null | undefined;
}

export interface GuestEmailVars {
  readonly orderNumber: string;
  readonly itemsSummary: string;
  readonly total: string;
  readonly currency: string;
  readonly eta?: string | undefined;
  readonly refundAmount?: string | undefined;
  /** Growth HIGH-10: link back to the live guest order-status tracker. */
  readonly statusUrl: string;
}

export interface SendGuestNotificationInput {
  readonly to: string;
  readonly locale: EmailLocale;
  readonly kind: GuestNotificationKind;
  readonly brandTheme: GuestBrandTheme | null;
  readonly brandName: string;
  readonly vars: GuestEmailVars;
  readonly tenantId: TenantId;
  readonly idempotencyKey: string;
}

export const EMAIL_ADAPTER_PORT = Symbol('EMAIL_ADAPTER_PORT');

export interface EmailAdapterPort {
  readonly adapterName: EmailAdapterName;

  sendInvitation(input: SendInvitationInput): Promise<void>;
  sendResetPassword(input: SendResetPasswordInput): Promise<void>;
  sendVerification(input: SendVerificationInput): Promise<void>;
  sendGuestNotification(input: SendGuestNotificationInput): Promise<void>;

  verifyTransport(): Promise<void>;
}
