import { Globe, QrCode, ShoppingBag, type LucideIcon } from 'lucide-react';

export interface OrderChannelPresentation {
  readonly icon: LucideIcon;
  /** Key under `orders.channel`, so a new source needs one line here and one per catalogue. */
  readonly labelKey: string;
}

/**
 * Where the order came from. Aggregators arrive in the data before the UI learns about them —
 * a Glovo order must render as *something* rather than crash the feed — so every lookup goes
 * through `channelPresentation`, which always answers.
 */
export const ORDER_CHANNELS: Record<string, OrderChannelPresentation> = {
  site: { icon: Globe, labelKey: 'site' },
  'qr-menu': { icon: QrCode, labelKey: 'qrMenu' },
};

const UNKNOWN_CHANNEL: OrderChannelPresentation = { icon: ShoppingBag, labelKey: 'unknown' };

export const channelPresentation = (channel: string): OrderChannelPresentation =>
  ORDER_CHANNELS[channel] ?? UNKNOWN_CHANNEL;
