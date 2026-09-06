import { afterEach, describe, expect, it, vi } from 'vitest';

const { getHeader, fetchMenuPublicMock } = vi.hoisted(() => ({
  getHeader: vi.fn(),
  fetchMenuPublicMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: getHeader }),
}));

vi.mock('@/lib/env', () => ({ websiteUrl: () => 'https://resto.app' }));

vi.mock('@/lib/api-client', () => ({
  fetchMenuPublic: fetchMenuPublicMock,
  fetchAvailabilityPublic: vi
    .fn()
    .mockResolvedValue({ stoppedItemIds: [], stoppedIngredientIds: [] }),
  TenantNotFoundError: class TenantNotFoundError extends Error {},
  TenantSuspendedError: class TenantSuspendedError extends Error {},
}));

vi.mock('@/components/layout/site-chrome', () => ({
  siteFooterLinks: vi.fn().mockResolvedValue([]),
}));

import { isApexHost } from '@/lib/apex-host';
import { ApexLanding } from '@/components/marketing/apex-landing';
import MenuPage from '@/app/page';

afterEach(() => {
  vi.clearAllMocks();
});

describe('isApexHost', () => {
  it('matches the bare apex', () => {
    expect(isApexHost('resto.app')).toBe(true);
  });

  it('matches www + apex', () => {
    expect(isApexHost('www.resto.app')).toBe(true);
  });

  it('matches the apex with an explicit port', () => {
    expect(isApexHost('resto.app:443')).toBe(true);
  });

  it('does not match a tenant subdomain', () => {
    expect(isApexHost('pizza.resto.app')).toBe(false);
  });

  it('does not match an unrelated host', () => {
    expect(isApexHost('evil.example.com')).toBe(false);
  });
});

describe('MenuPage apex branch', () => {
  it('renders the landing without calling the tenant fetcher', async () => {
    getHeader.mockReturnValue('resto.app');
    fetchMenuPublicMock.mockResolvedValue({ tenant: null });

    const element = await MenuPage();

    expect(fetchMenuPublicMock).not.toHaveBeenCalled();
    expect((element as { type: unknown }).type).toBe(ApexLanding);
  });

  it('still calls the tenant fetcher for a non-apex host', async () => {
    getHeader.mockReturnValue('pizza.resto.app');
    fetchMenuPublicMock.mockRejectedValue(new Error('boom'));

    await expect(MenuPage()).rejects.toThrow('boom');
    expect(fetchMenuPublicMock).toHaveBeenCalledTimes(1);
  });
});
