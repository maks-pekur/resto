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
const FORM_ID = 'modifier-group-form';

const initialValues = { name: 'Соусы', minSelectable: 0, maxSelectable: 3 };

const submitForm = (): void => {
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
  if (!form) throw new Error(`form#${FORM_ID} not in document`);
  fireEvent.submit(form);
};

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
        formId={FORM_ID}
        onStateChange={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue('Соусы')).toBeInTheDocument();
  });

  it('reports form state via onStateChange (isNew, isDirty, isPending)', async () => {
    const onStateChange = vi.fn();
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
        formId={FORM_ID}
        onStateChange={onStateChange}
      />,
    );
    await waitFor(() => {
      expect(onStateChange).toHaveBeenLastCalledWith({
        isNew: false,
        isDirty: false,
        isPending: false,
      });
    });
    fireEvent.input(screen.getByDisplayValue('Соусы'), { target: { value: 'Сиропы' } });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenLastCalledWith({
        isNew: false,
        isDirty: true,
        isPending: false,
      });
    });
  });

  it('reports isNew=true for groupId="new"', async () => {
    const onStateChange = vi.fn();
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId="new"
        onSaved={() => undefined}
        formId={FORM_ID}
        onStateChange={onStateChange}
      />,
    );
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ isNew: true, isPending: false }),
      );
    });
  });

  it('calls upsertModifierGroupAction when the form is submitted externally', async () => {
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: GROUP_ID });
    render(
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId={GROUP_ID}
        onSaved={() => undefined}
        formId={FORM_ID}
        onStateChange={() => undefined}
      />,
    );
    fireEvent.input(screen.getByDisplayValue('Соусы'), { target: { value: 'Сиропы' } });
    await act(async () => {
      submitForm();
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
      <ModifierGroupFormClient
        initialValues={initialValues}
        groupId="new"
        onSaved={onSaved}
        formId={FORM_ID}
        onStateChange={() => undefined}
      />,
    );
    await act(async () => {
      submitForm();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSaved).toHaveBeenCalledWith(GROUP_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/modifier-groups/${GROUP_ID}`);
  });
});
