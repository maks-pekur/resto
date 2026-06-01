import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertModifierGroupActionMock = vi.fn();
const routerReplaceMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action', () => ({
  upsertModifierGroupAction: upsertModifierGroupActionMock,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));

const { ModifierGroupFormClient } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-group-form-client');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const initialValues = { name: 'Соусы', minSelectable: 0, maxSelectable: 3 };

describe('ModifierGroupFormClient (Plan 04b-08 Task 3, explicit save)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form prefilled with initialValues', () => {
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue('Соусы')).toBeInTheDocument();
  });

  it('shows "Создать группу" for new and "Сохранить" for existing', () => {
    const { rerender } = render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId="new"
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Создать группу' })).toBeInTheDocument();
    rerender(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('disables Save until the existing form becomes dirty', () => {
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('calls upsertModifierGroupAction on submit and forwards the existing groupId', async () => {
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: GROUP_ID });
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
      />,
    );
    fireEvent.input(screen.getByDisplayValue('Соусы'), { target: { value: 'Сиропы' } });
    const btn = screen.getByRole('button', { name: 'Сохранить' });
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertModifierGroupActionMock).toHaveBeenCalledTimes(1);
    const firstCall = upsertModifierGroupActionMock.mock.calls[0] as
      | readonly [{ readonly groupId?: string }]
      | undefined;
    expect(firstCall?.[0].groupId).toBe(GROUP_ID);
  });

  it('flips URL via router.replace and calls onSaved for new groups', async () => {
    const onSaved = vi.fn();
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: GROUP_ID });
    render(
      <ModifierGroupFormClient initialValues={initialValues} groupId="new" onSaved={onSaved} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Создать группу' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSaved).toHaveBeenCalledWith(GROUP_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/modifier-groups/${GROUP_ID}`);
  });
});
