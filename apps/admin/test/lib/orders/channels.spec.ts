import { describe, expect, it } from 'vitest';
import { channelPresentation, ORDER_CHANNELS } from '@/lib/orders/channels';

describe('order channels', () => {
  it('knows our own surfaces and the partners we expect', () => {
    expect(Object.keys(ORDER_CHANNELS)).toContain('site');
    expect(Object.keys(ORDER_CHANNELS)).toContain('qr-menu');
    expect(Object.keys(ORDER_CHANNELS)).toContain('glovo');
  });

  it('paints our own channels from tokens and partners from their own brand', () => {
    expect(channelPresentation('site').tone).toBeDefined();
    expect(channelPresentation('site').brand).toBeUndefined();
    expect(channelPresentation('glovo').brand).toBeDefined();
    expect(channelPresentation('glovo').tone).toBeUndefined();
  });

  it('names each of them', () => {
    expect(channelPresentation('site').labelKey).toBe('site');
    expect(channelPresentation('qr-menu').labelKey).toBe('qrMenu');
  });

  it('answers for a partner the UI has never heard of rather than breaking the feed', () => {
    const unheardOf = channelPresentation('deliveroo');

    expect(unheardOf.labelKey).toBe('unknown');
    expect(unheardOf.icon).toBeDefined();
  });
});
