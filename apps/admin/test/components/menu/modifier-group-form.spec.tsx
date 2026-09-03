import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ModifierGroupForm } from '@/lib/menu/zod-schemas';

const { apiFetchMock, navigateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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

const { ModifierGroupFormComponent } = await import('@/components/menu/modifier-group-form');

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);

const initialValues: ModifierGroupForm = {
  name: { ru: 'Соус' },
  display: 'tiles',
  behaviour: 'several',
  isRequired: false,
};

const renderForm = (): void => {
  render(
    <Wrap>
      <ModifierGroupFormComponent
        initialValues={initialValues}
        groupId="group-1"
        onSaved={vi.fn()}
        formId="test-form"
        onStateChange={vi.fn()}
      />
      <button type="submit" form="test-form">
        save
      </button>
    </Wrap>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  navigateMock.mockClear();
  apiFetchMock.mockImplementation((url: string) => {
    if (url === '/v1/tenants/me') {
      return Promise.resolve({ ok: true, data: { locale: 'ru', contentLocales: ['ru'] } });
    }
    return Promise.resolve({ ok: true, data: { id: 'group-1' } });
  });
});

describe('ModifierGroupFormComponent', () => {
  it('renders no numeric input', () => {
    renderForm();
    expect(document.querySelector('input[type="number"]')).not.toBeInTheDocument();
  });

  it('submits display: tabs and behaviour: one after choosing Tabs + One', async () => {
    renderForm();

    await userEvent.click(screen.getByTestId('group-display-tabs'));
    await userEvent.click(screen.getByTestId('group-behaviour-one'));
    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/catalog/modifier-groups',
        expect.objectContaining({
          method: 'POST',
          body: {
            name: { ru: 'Соус' },
            display: 'tabs',
            behaviour: 'one',
            isRequired: false,
            id: 'group-1',
          },
        }),
      );
    });
  });

  it('submits isRequired: true after toggling Required', async () => {
    renderForm();

    await userEvent.click(screen.getByTestId('group-required-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/catalog/modifier-groups',
        expect.objectContaining({
          method: 'POST',
          body: {
            name: { ru: 'Соус' },
            display: 'tiles',
            behaviour: 'several',
            isRequired: true,
            id: 'group-1',
          },
        }),
      );
    });
  });
});
