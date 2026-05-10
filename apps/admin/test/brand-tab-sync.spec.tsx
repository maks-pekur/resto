import { render, act, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const { BrandTabSync } = await import('../components/brand-tab-sync');

describe('BrandTabSync', () => {
  afterEach(() => {
    cleanup();
    refreshMock.mockReset();
  });

  it('calls router.refresh when a storage event for resto.active_brand_changed_at fires', () => {
    render(<BrandTabSync />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'resto.active_brand_changed_at', newValue: '123' }),
      );
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('ignores storage events for unrelated keys', () => {
    render(<BrandTabSync />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'x' }));
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const { unmount } = render(<BrandTabSync />);
    unmount();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'resto.active_brand_changed_at', newValue: '456' }),
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
