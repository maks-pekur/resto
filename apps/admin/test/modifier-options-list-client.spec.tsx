import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertModifierOptionActionMock = vi.fn();

vi.mock(
  '../app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action',
  () => ({ upsertModifierOptionAction: upsertModifierOptionActionMock }),
);

const { ModifierOptionsListClient } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-options-list-client');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';

describe('ModifierOptionsListClient (Plan 04b-08 Task 3)', () => {
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

  it("shows a 'save group first' helper when groupId='new'", () => {
    render(
      <ModifierOptionsListClient groupId="new" options={[]} onOptionsChange={() => undefined} />,
    );
    expect(screen.getByText(/Сначала сохраните название группы/u)).toBeInTheDocument();
    expect(screen.getByText('+ Добавить вариант')).toBeDisabled();
  });

  it('appends a draft row when "+ Добавить вариант" is clicked', () => {
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('+ Добавить вариант'));
    expect(screen.getByPlaceholderText('Название')).toBeInTheDocument();
  });

  it('persists a row via upsertModifierOptionAction on name blur', async () => {
    upsertModifierOptionActionMock.mockResolvedValue({ ok: true, id: OPTION_ID });
    render(
      <ModifierOptionsListClient
        groupId={GROUP_ID}
        options={[]}
        onOptionsChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('+ Добавить вариант'));
    const nameInput = screen.getByPlaceholderText('Название');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Карамель' } });
      fireEvent.blur(nameInput);
      await Promise.resolve();
    });
    expect(upsertModifierOptionActionMock).toHaveBeenCalled();
    const firstCall = upsertModifierOptionActionMock.mock.calls[0] as
      | readonly [{ readonly groupId: string; readonly values: { readonly name: string } }]
      | undefined;
    expect(firstCall?.[0].groupId).toBe(GROUP_ID);
    expect(firstCall?.[0].values.name).toBe('Карамель');
  });

  it('hydrates rows from props and renders the existing name', () => {
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
    expect(screen.getByDisplayValue('Шоколад')).toBeInTheDocument();
  });
});
