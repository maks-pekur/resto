import { describe, expect, it } from 'vitest';
import { channelPresentation, ORDER_CHANNELS } from '@/lib/orders/channels';

describe('order channels', () => {
  it('knows the two sources orders arrive from today', () => {
    expect(Object.keys(ORDER_CHANNELS).sort()).toEqual(['qr-menu', 'site']);
  });

  it('names each of them', () => {
    expect(channelPresentation('site').labelKey).toBe('site');
    expect(channelPresentation('qr-menu').labelKey).toBe('qrMenu');
  });

  it('answers for an aggregator the UI has never heard of rather than breaking the feed', () => {
    const glovo = channelPresentation('glovo');

    expect(glovo.labelKey).toBe('unknown');
    expect(glovo.icon).toBeDefined();
  });
});
