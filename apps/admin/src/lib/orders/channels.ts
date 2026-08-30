import { Bike, Globe, QrCode, ShoppingBag, type LucideIcon } from 'lucide-react';

export interface OrderChannelPresentation {
  readonly icon: LucideIcon;
  /** Key under `orders.channel`, so a new source needs one line here and one per catalogue. */
  readonly labelKey: string;
  /** Our own surfaces paint themselves from the app's tokens. */
  readonly tone?: string;
  /**
   * A partner's own colours. Kept as literal values on purpose: these are somebody else's brand,
   * not our design system, and they must never drift with our theme. Swap for the real logo mark
   * once we are licensed to ship it — the cell already leaves room for one.
   */
  readonly brand?: { readonly background: string; readonly foreground: string };
}

/**
 * Where the order came from. Aggregators arrive in the data before the UI learns about them —
 * a Glovo order must render as *something* rather than crash the feed — so every lookup goes
 * through `channelPresentation`, which always answers.
 */
export const ORDER_CHANNELS: Record<string, OrderChannelPresentation> = {
  site: { icon: Globe, labelKey: 'site', tone: 'bg-muted text-muted-foreground' },
  'qr-menu': { icon: QrCode, labelKey: 'qrMenu', tone: 'bg-primary/10 text-primary' },
  glovo: {
    icon: Bike,
    labelKey: 'glovo',
    brand: { background: '#FFC244', foreground: '#1A1A1A' },
  },
  'uber-eats': {
    icon: Bike,
    labelKey: 'uberEats',
    brand: { background: '#06C167', foreground: '#0B1B10' },
  },
  bolt: {
    icon: Bike,
    labelKey: 'bolt',
    brand: { background: '#34D186', foreground: '#08210F' },
  },
  wolt: {
    icon: Bike,
    labelKey: 'wolt',
    brand: { background: '#00C2E8', foreground: '#04222A' },
  },
};

const UNKNOWN_CHANNEL: OrderChannelPresentation = {
  icon: ShoppingBag,
  labelKey: 'unknown',
  tone: 'bg-muted text-muted-foreground',
};

export const channelPresentation = (channel: string): OrderChannelPresentation =>
  ORDER_CHANNELS[channel] ?? UNKNOWN_CHANNEL;
