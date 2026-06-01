import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertModifierGroupActionMock = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action', () => ({
  upsertModifierGroupAction: upsertModifierGroupActionMock,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
}));

const { ModifierGroupFormClient } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/modifier-group-form-client');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const initialValues = { name: 'Соусы', minSelectable: 0, maxSelectable: 3 };

describe('ModifierGroupFormClient (Plan 04b-08 Task 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the form prefilled with initialValues', () => {
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onFirstSave={() => undefined}
        onSaveState={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue('Соусы')).toBeInTheDocument();
  });

  it('fires upsertModifierGroupAction 1500ms after a name field edit', async () => {
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: GROUP_ID });
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onFirstSave={() => undefined}
        onSaveState={() => undefined}
      />,
    );
    act(() => {
      fireEvent.input(screen.getByDisplayValue('Соусы'), { target: { value: 'Сиропы' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertModifierGroupActionMock).toHaveBeenCalledTimes(1);
    const firstCall = upsertModifierGroupActionMock.mock.calls[0] as
      | readonly [{ readonly groupId?: string }]
      | undefined;
    expect(firstCall?.[0].groupId).toBe(GROUP_ID);
  });

  it('flips URL via router.replace and onFirstSave when groupId is "new"', async () => {
    const onFirstSave = vi.fn();
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: GROUP_ID });
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId="new"
        onFirstSave={onFirstSave}
        onSaveState={() => undefined}
      />,
    );
    act(() => {
      fireEvent.input(screen.getByDisplayValue('Соусы'), { target: { value: 'Сиропы' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFirstSave).toHaveBeenCalledWith(GROUP_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/modifier-groups/${GROUP_ID}`);
  });
});
