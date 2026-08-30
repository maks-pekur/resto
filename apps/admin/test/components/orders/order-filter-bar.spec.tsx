import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { OrderFilterBar } = await import('@/components/orders/order-filter-bar');

const renderBar = (soundReady: boolean) =>
  render(
    <OrderFilterBar
      statusFilter="active"
      onStatusFilterChange={vi.fn()}
      datePreset="today"
      onDatePresetChange={vi.fn()}
      isLive
      soundMuted={false}
      onSoundMutedChange={vi.fn()}
      soundBlocked={false}
      soundReady={soundReady}
      notificationsBlocked={false}
    />,
  );

describe('OrderFilterBar', () => {
  it('withholds the mute switch while the enable-sound banner is still asking', () => {
    renderBar(false);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('offers the mute switch once sound is unlocked', () => {
    renderBar(true);

    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
});
