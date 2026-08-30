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
  slug: 'cafe-roma',
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
  it('offers only the profiles the restaurant has not filled in yet', async () => {
    const user = userEvent.setup();
    renderForm({ socials: { instagram: 'https://instagram.com/caferoma' } });

    expect(screen.getByLabelText('Instagram')).toHaveValue('caferoma');

    await user.click(screen.getByRole('button', { name: 'settings.brand.socialAdd' }));

    expect(screen.queryByRole('menuitem', { name: 'Instagram' })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Facebook' })).toBeInTheDocument();
  });

  it('drops a profile the operator removed', async () => {
    const user = userEvent.setup();
    renderForm({ socials: { instagram: 'https://instagram.com/caferoma' } });
    updateBrand.mockClear();

    await user.click(screen.getByRole('button', { name: 'settings.brand.socialRemove' }));
    await user.click(screen.getByRole('button', { name: 'settings.brand.save' }));

    expect(updateBrand).toHaveBeenCalledWith(expect.objectContaining({ socials: {} }));
  });

  it('saves nothing until something changes', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'settings.brand.save' })).toBeDisabled();
  });

  it('keeps the constant head of the link out of the field', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'settings.brand.socialAdd' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Instagram' }));
    await user.type(screen.getByLabelText('Instagram'), 'caferoma');
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
