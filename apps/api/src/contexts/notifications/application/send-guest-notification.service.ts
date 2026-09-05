import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId, TenantTheme, resolveThemeMedia } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import {
  GUEST_ORDER_STATUS_PATH,
  guestHostForTenant,
  guestOrderStatusUrl,
} from '../../../shared/guest-links';
import { SUPPORTED_LOCALES, type EmailLocale } from '../../identity/domain/email-locale';
import {
  NOTIFICATION_ORDER_REPOSITORY,
  type NotificationOrderRepository,
} from '../infrastructure/notification-order-drizzle.repository';
import { EMAIL_ADAPTER_PORT, type EmailAdapterPort } from '../domain/ports';

// `tenants.locale` (D-35/D-36) is derived from a country registry {ru, en, es}
// wider than the email-adapter's current `EmailLocale` union {en, ru}. D-38
// requires a deliberate fallback rather than passing an unsupported locale
// through — 'es' guest email content does not exist yet.
const resolveEmailLocale = (tenantLocale: string): EmailLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(tenantLocale)
    ? (tenantLocale as EmailLocale)
    : 'en';

export type GuestNotificationTransition =
  | 'order_confirmation'
  | 'order_refunded'
  | 'order_accepted'
  | 'order_ready';

export interface SendGuestNotificationInput {
  readonly orderId: string;
  readonly tenantId: string;
  readonly transition: GuestNotificationTransition;
  readonly refundAmountMinor?: number | undefined;
}

const ETA_CLOCK_TIME_LOCALE = 'ru-RU';
const ETA_CLOCK_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const formatEtaClockTime = (etaAt: Date, timezone: string | null): string => {
  try {
    return new Intl.DateTimeFormat(ETA_CLOCK_TIME_LOCALE, {
      ...ETA_CLOCK_TIME_OPTS,
      timeZone: timezone ?? 'UTC',
    }).format(etaAt);
  } catch {
    return new Intl.DateTimeFormat(ETA_CLOCK_TIME_LOCALE, {
      ...ETA_CLOCK_TIME_OPTS,
      timeZone: 'UTC',
    }).format(etaAt);
  }
};

@Injectable()
export class SendGuestNotificationService {
  private readonly logger = new Logger(SendGuestNotificationService.name);

  constructor(
    @Inject(EMAIL_ADAPTER_PORT) private readonly emailAdapter: EmailAdapterPort,
    @Inject(NOTIFICATION_ORDER_REPOSITORY)
    private readonly orderRepo: NotificationOrderRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async execute(input: SendGuestNotificationInput): Promise<void> {
    const tenantId = TenantId.parse(input.tenantId);

    const order = await this.orderRepo.findOrder(tenantId, input.orderId);

    if (!order) {
      this.logger.warn(
        { orderId: input.orderId, tenantId },
        'Order not found for guest notification — skipping',
      );
      return;
    }

    if (!order.customerEmail) {
      this.logger.warn(
        { orderId: input.orderId, tenantId },
        'No customer email on order — skipping guest notification',
      );
      return;
    }

    const locale = resolveEmailLocale(order.tenantLocale);
    const tenantName = order.tenantDisplayName;
    const tenantTheme = order.tenantTheme
      ? (() => {
          const theme = TenantTheme.parse(order.tenantTheme);
          // An e-mail client fetches this from anywhere, so the logo must stay absolute.
          return {
            logoUrl:
              theme.logoUrl === null
                ? null
                : resolveThemeMedia(theme.logoUrl, this.env.MEDIA_PUBLIC_BASE_URL),
            accentColor: theme.primaryColor,
          };
        })()
      : null;

    const itemsRows = await this.orderRepo.findOrderItems(tenantId, input.orderId);
    const itemsSummary = itemsRows
      .map((r) => `${String(r.quantity)}x ${r.nameSnapshot}`)
      .join(', ');

    const refundAmount =
      input.refundAmountMinor !== undefined
        ? (input.refundAmountMinor / 100).toFixed(2)
        : undefined;

    const eta =
      order.etaAt !== null ? formatEtaClockTime(order.etaAt, order.locationTimezone) : undefined;

    const statusUrl = ((): string => {
      try {
        const guestHost = guestHostForTenant(
          this.env,
          { slug: order.tenantSlug },
          order.primaryCustomDomain,
        );
        return guestOrderStatusUrl(guestHost, input.orderId);
      } catch {
        // No absolute origin can be composed (no apex, no custom domain) — a relative link is
        // better than shipping a broken absolute one.
        return `${GUEST_ORDER_STATUS_PATH}/${input.orderId}`;
      }
    })();

    const idempotencyKey = `gnotif:${input.orderId}:${input.transition}`;

    await this.emailAdapter.sendGuestNotification({
      to: order.customerEmail,
      locale,
      kind: input.transition,
      tenantTheme,
      tenantName,
      vars: {
        orderNumber: order.orderNumber,
        itemsSummary,
        total: order.total,
        currency: order.currency,
        statusUrl,
        ...(eta !== undefined ? { eta } : {}),
        ...(refundAmount !== undefined ? { refundAmount } : {}),
      },
      tenantId,
      idempotencyKey,
    });

    this.logger.log(
      { orderId: input.orderId, tenantId, transition: input.transition },
      'Guest notification sent',
    );
  }
}
