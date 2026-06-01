import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertModifierOptionActionMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock(
  '../app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action',
  () => ({ upsertModifierOptionAction: upsertModifierOptionActionMock }),
);
vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));

const { ModifierOptionsListClient } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-options-list-client');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';

describe('ModifierOptionsListClient (Plan 04b-08 Task 3, explicit save)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state helper when there are no options', () => {
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    expect(screen.getByText(/Нет вариантов — добавьте первый/u)).toBeInTheDocument();
  });

  it("shows a 'save group first' helper and disables both buttons when groupId='new'", () => {
    render(
      <ModifierOptionsListClient groupId="new" options={[]} onOptionsChange={() => undefined} />,
    );
    expect(screen.getByText(/Сначала сохраните название группы/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Добавить вариант' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить варианты' })).toBeDisabled();
  });

  it('appends a draft row when "+ Добавить вариант" is clicked', () => {
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить вариант' }));
    expect(screen.getByPlaceholderText('Название')).toBeInTheDocument();
  });

  it('disables Сохранить варианты until local rows diverge from props', () => {
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[
          {
            id: OPTION_ID,
            name: { ru: 'Шоколад' },
            priceDelta: '1.50',
            defaultAmount: 0,
            freeAmount: 0,
            sortOrder: 0,
          },
        ]}
        onOptionsChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Сохранить варианты' })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Шоколад'), { target: { value: 'Карамель' } });
    expect(screen.getByRole('button', { name: 'Сохранить варианты' })).not.toBeDisabled();
  });

  it('persists rows via upsertModifierOptionAction on Сохранить варианты', async () => {
    upsertModifierOptionActionMock.mockResolvedValue({ ok: true, id: OPTION_ID });
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить вариант' }));
    fireEvent.change(screen.getByPlaceholderText('Название'), { target: { value: 'Карамель' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить варианты' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertModifierOptionActionMock).toHaveBeenCalled();
    const firstCall = upsertModifierOptionActionMock.mock.calls[0] as
      | readonly [{ readonly groupId: string; readonly values: { readonly name: string } }]
      | undefined;
    expect(firstCall?.[0].groupId).toBe(GROUP_ID);
    expect(firstCall?.[0].values.name).toBe('Карамель');
    expect(showSuccessMock).toHaveBeenCalled();
  });

  it('toasts an error when at least one row fails to save', async () => {
    upsertModifierOptionActionMock.mockResolvedValue({ ok: false, error: 'boom' });
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить вариант' }));
    fireEvent.change(screen.getByPlaceholderText('Название'), { target: { value: 'X' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить варианты' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
