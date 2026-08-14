import type { EmailLocale } from '../../identity/domain/email-locale';
import type {
  GuestBrandTheme,
  GuestEmailVars,
  GuestNotificationKind,
} from '../../identity/domain/ports';

export type { GuestBrandTheme, GuestEmailVars, GuestNotificationKind };

export interface RenderedGuestEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/u;
const HTTPS_URL_RE = /^https:\/\//iu;

const DEFAULT_ACCENT = '#1a1a1a';

const STATUS_LINK_LABEL: Record<'en' | 'ru', string> = {
  en: 'Track your order',
  ru: 'Следить за заказом',
};

const sanitizeAccentColor = (raw: string | null | undefined): string => {
  if (!raw) return DEFAULT_ACCENT;
  const trimmed = raw.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : DEFAULT_ACCENT;
};

const sanitizeLogoUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  return HTTPS_URL_RE.test(trimmed) ? trimmed : null;
};

const STRINGS: Record<
  'en' | 'ru',
  Record<
    GuestNotificationKind,
    { subject: string; heading: string; body: (vars: GuestEmailVars) => string }
  >
> = {
  en: {
    order_confirmation: {
      subject: 'Your order is confirmed',
      heading: 'Order confirmed',
      body: (v) =>
        `Thank you! Order #${v.orderNumber} has been received.\n\n${v.itemsSummary}\n\nTotal: ${v.total} ${v.currency}${v.eta ? `\nEstimated ready: ${v.eta}` : ''}`,
    },
    order_refunded: {
      subject: 'Your refund is on its way',
      heading: 'Refund issued',
      body: (v) =>
        `A refund of ${v.refundAmount ?? v.total} ${v.currency} for order #${v.orderNumber} has been processed.`,
    },
    order_accepted: {
      subject: 'Your order has been accepted',
      heading: 'Order accepted',
      body: (v) =>
        `Good news! Order #${v.orderNumber} has been accepted and is being prepared.${v.eta ? `\nEstimated ready: ${v.eta}` : ''}`,
    },
    order_ready: {
      subject: 'Your order is ready',
      heading: 'Order ready',
      body: (v) => `Order #${v.orderNumber} is ready for pickup!`,
    },
  },
  ru: {
    order_confirmation: {
      subject: 'Ваш заказ принят',
      heading: 'Заказ подтверждён',
      body: (v) =>
        `Спасибо! Заказ №${v.orderNumber} получен.\n\n${v.itemsSummary}\n\nИтого: ${v.total} ${v.currency}${v.eta ? `\nОриентировочное время: ${v.eta}` : ''}`,
    },
    order_refunded: {
      subject: 'Возврат средств оформлен',
      heading: 'Возврат оформлен',
      body: (v) =>
        `Возврат ${v.refundAmount ?? v.total} ${v.currency} по заказу №${v.orderNumber} обработан.`,
    },
    order_accepted: {
      subject: 'Ваш заказ принят в работу',
      heading: 'Заказ принят',
      body: (v) =>
        `Заказ №${v.orderNumber} принят и готовится.${v.eta ? `\nОриентировочное время: ${v.eta}` : ''}`,
    },
    order_ready: {
      subject: 'Ваш заказ готов',
      heading: 'Заказ готов',
      body: (v) => `Заказ №${v.orderNumber} готов к выдаче!`,
    },
  },
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildHtml = (opts: {
  heading: string;
  bodyText: string;
  brandName: string;
  accentColor: string;
  logoUrl: string | null;
  statusUrl: string;
  statusLinkLabel: string;
}): string => {
  const logo = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${escapeHtml(opts.brandName)}" style="max-height:48px;display:block;margin:0 auto 16px;" />`
    : '';

  const bodyLines = opts.bodyText
    .split('\n')
    .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`)
    .join('');

  const statusLink = `<p style="margin:16px 0 0;"><a href="${escapeHtml(opts.statusUrl)}" style="color:${opts.accentColor};text-decoration:underline;">${escapeHtml(opts.statusLinkLabel)}</a></p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:32px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <tr><td style="background:${opts.accentColor};padding:24px;text-align:center;">
      ${logo}
      <span style="color:#fff;font-size:20px;font-weight:600;">${escapeHtml(opts.brandName)}</span>
    </td></tr>
    <tr><td style="padding:32px;">
      <h1 style="font-size:18px;margin:0 0 16px;color:#111;">${escapeHtml(opts.heading)}</h1>
      ${bodyLines}
      ${statusLink}
    </td></tr>
  </table>
</body>
</html>`;
};

export const renderGuestEmail = (
  kind: GuestNotificationKind,
  locale: EmailLocale,
  brandTheme: GuestBrandTheme | null,
  brandName: string,
  vars: GuestEmailVars,
): RenderedGuestEmail => {
  const strings = STRINGS[locale];
  const template = strings[kind];
  const accentColor = sanitizeAccentColor(brandTheme?.accentColor);
  const logoUrl = sanitizeLogoUrl(brandTheme?.logoUrl);
  const bodyText = template.body(vars);
  const statusLinkLabel = STATUS_LINK_LABEL[locale];

  return {
    subject: template.subject,
    html: buildHtml({
      heading: template.heading,
      bodyText,
      brandName,
      accentColor,
      logoUrl,
      statusUrl: vars.statusUrl,
      statusLinkLabel,
    }),
    text: `${bodyText}\n\n${statusLinkLabel}: ${vars.statusUrl}`,
  };
};
