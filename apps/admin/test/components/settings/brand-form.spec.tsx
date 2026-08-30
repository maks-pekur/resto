import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TenantResponse } from '@/lib/queries/tenancy';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'ru', changeLanguage: vi.fn() },
    }),
  };
});

const updateBrand = vi.fn().mockResolvedValue({ ok: true, status: 200, data: null });
vi.mock('@/lib/queries/tenancy', () => ({
  updateBrand,
  getBrandLogoUploadUrl: vi.fn(),
  tenancyQuery: () => ({ queryKey: ['tenancy', 'me'], queryFn: () => Promise.resolve(null) }),
}));

vi.mock('@/hooks/use-content-locales', () => ({
  useContentLocales: () => ({ defaultLocale: 'ru', locales: ['ru', 'en'] }),
}));

const { BrandForm } = await import('@/components/settings/brand-form');

const tenant = {
  displayName: 'Cafe Roma',
  description: null,
  socials: {},
  contacts: { phone: null, email: null, website: null },
  theme: null,
} as unknown as TenantResponse;

const renderForm = (over: Partial<TenantResponse> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BrandForm tenant={{ ...tenant, ...over }} />
    </QueryClientProvider>,
  );

describe('BrandForm', () => {
  it('saves nothing until something changes', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'settings.brand.save' })).toBeDisabled();
  });

  it('adds the scheme an operator did not type', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Instagram'), 'instagram.com/caferoma');
    await user.click(screen.getByRole('button', { name: 'settings.brand.save' }));

    expect(updateBrand).toHaveBeenCalledWith(
      expect.objectContaining({ socials: { instagram: 'https://instagram.com/caferoma' } }),
    );
  });

  it('sends empty contact fields as nothing, not as blanks', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('settings.brand.phoneLabel'), '+34 600 00 00 00');
    await user.click(screen.getByRole('button', { name: 'settings.brand.save' }));

    expect(updateBrand).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: { phone: '+34 600 00 00 00', email: null, website: null },
      }),
    );
  });

  it('refuses an email that is not one', async () => {
    const user = userEvent.setup();
    renderForm();
    updateBrand.mockClear();

    await user.type(screen.getByLabelText('settings.brand.emailLabel'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'settings.brand.save' }));

    expect(updateBrand).not.toHaveBeenCalled();
    expect(await screen.findByText('settings.brand.emailInvalid')).toBeInTheDocument();
  });
});
