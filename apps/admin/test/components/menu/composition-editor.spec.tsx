import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock.mockImplementation((path: string) => {
    if (path.includes('/v1/catalog/modifier-options')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        data: {
          items: [
            { id: 'ing-1', name: { ru: 'Сыр', en: 'Cheese' }, priceDelta: '0.00', imageUrl: null },
            { id: 'ing-2', name: { ru: 'Лук', en: 'Onion' }, priceDelta: '0.00', imageUrl: null },
          ],
        },
      });
    }
    return Promise.resolve({ ok: true, status: 200, data: null });
  }),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string, vars?: Record<string, unknown>) => {
        const full = opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key;
        return vars && Object.keys(vars).length > 0 ? `${full}(${JSON.stringify(vars)})` : full;
      },
      i18n: { language: 'ru', changeLanguage: vi.fn() },
    }),
  };
});

const { CompositionEditor } = await import('@/components/menu/composition-editor');

const baseValues: ItemEditorForm = {
  name: {},
  description: null,
  categoryId: '00000000-0000-0000-0000-000000000000',
  basePrice: 0,
  currency: 'USD',
  allergens: [],
  diets: [],
  compositionMode: 'text',
  compositionText: [],
  compositionAssembled: [{ optionId: 'ing-1', removable: true }],
  metaTitle: null,
  metaDescription: null,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
};

const Harness = ({
  defaultValues,
  onSubmit,
}: {
  readonly defaultValues: ItemEditorForm;
  readonly onSubmit: (values: ItemEditorForm) => void;
}): React.ReactElement => {
  const form = useForm<ItemEditorForm>({ defaultValues });
  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
      >
        <CompositionEditor />
        <button type="submit">submit</button>
      </form>
    </FormProvider>
  );
};

const renderHarness = (
  defaultValues: ItemEditorForm,
  onSubmit: (values: ItemEditorForm) => void = vi.fn(),
): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness defaultValues={defaultValues} onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
};

describe('CompositionEditor', () => {
  it('reveals the ordered list and hides the text input in assembled mode', async () => {
    const user = userEvent.setup();
    renderHarness({ ...baseValues, compositionMode: 'text' });

    expect(
      screen.getByPlaceholderText('menu.editor.compositionTextPlaceholder'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /compositionModeAssembled/ }));

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('menu.editor.compositionTextPlaceholder'),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Сыр')).toBeInTheDocument();
    });
  });

  it('renders a removable Switch and no price for an assembled row', async () => {
    renderHarness({ ...baseValues, compositionMode: 'assembled' });

    await waitFor(() => {
      expect(screen.getByText('Сыр')).toBeInTheDocument();
    });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('data-state', 'checked');
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it('drops a removed line from the submitted compositionAssembled array', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderHarness(
      {
        ...baseValues,
        compositionMode: 'assembled',
        compositionAssembled: [
          { optionId: 'ing-1', removable: true },
          { optionId: 'ing-2', removable: false },
        ],
      },
      onSubmit,
    );

    await waitFor(() => {
      expect(screen.getByText('Сыр')).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole('button', {
      name: /compositionRemoveLineAriaLabel/,
    });
    expect(removeButtons).toHaveLength(2);
    const [firstRemoveButton] = removeButtons;
    if (!firstRemoveButton) throw new Error('expected a remove button');
    await user.click(firstRemoveButton);

    await user.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const submitted = onSubmit.mock.calls[0]?.[0] as ItemEditorForm;
    expect(submitted.compositionAssembled).toEqual([{ optionId: 'ing-2', removable: false }]);
  });
});
