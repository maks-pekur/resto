import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';

const upsertItemModifierGroupsActionMock = vi.fn();
const upsertModifierGroupActionMock = vi.fn();
const routerPushMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-modifier-groups-action', () => ({
  upsertItemModifierGroupsAction: upsertItemModifierGroupsActionMock,
}));
vi.mock('../app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action', () => ({
  upsertModifierGroupAction: upsertModifierGroupActionMock,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));

const { ItemModifierGroupsCardClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-modifier-groups-card-client');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_A = '22222222-2222-4222-8222-222222222222';
const GROUP_B = '33333333-3333-4333-8333-333333333333';
const GROUP_C = '44444444-4444-4444-8444-444444444444';

const availableGroups = [
  { id: GROUP_A, name: 'Соусы', optionCount: 3 },
  { id: GROUP_B, name: 'Сиропы', optionCount: 2 },
  { id: GROUP_C, name: 'Топпинги', optionCount: 4 },
];

function WithForm({
  children,
  defaultIngredients = [],
}: {
  children: React.ReactNode;
  defaultIngredients?: string[];
}): React.ReactElement {
  const form = useForm({ defaultValues: { ingredients: defaultIngredients } });
  return <FormProvider {...form}>{children}</FormProvider>;
}

const renderCard = (
  props: React.ComponentProps<typeof ItemModifierGroupsCardClient>,
): ReturnType<typeof render> =>
  render(
    <WithForm>
      <ItemModifierGroupsCardClient {...props} />
    </WithForm>,
  );

describe('ItemModifierGroupsCardClient (Plan 04b-08 Task 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a save-first helper when itemId is "new"', () => {
    renderCard({
      itemId: 'new',
      initialModifierGroupIds: [],
      availableGroups,
    });
    expect(screen.getByText(/Сначала сохраните блюдо/u)).toBeInTheDocument();
    expect(screen.queryByText('+ Добавить группу')).not.toBeInTheDocument();
  });

  it('renders chips for assigned groups', () => {
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [GROUP_A],
      availableGroups,
    });
    expect(screen.getByTestId(`mg-chip-${GROUP_A}`)).toBeInTheDocument();
    expect(screen.getByText('Соусы')).toBeInTheDocument();
  });

  it('removes a chip and persists the trimmed list', async () => {
    upsertItemModifierGroupsActionMock.mockResolvedValue({ ok: true });
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [GROUP_A, GROUP_B],
      availableGroups,
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Убрать группу Соусы'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(upsertItemModifierGroupsActionMock).toHaveBeenCalledWith(ITEM_ID, [GROUP_B]);
    });
  });

  it('opens the Sheet on "+ Добавить группу"', () => {
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [],
      availableGroups,
    });
    fireEvent.click(screen.getByText('+ Добавить группу'));
    expect(screen.getByText('Добавить группу модификаторов')).toBeInTheDocument();
  });

  it('persists an addition when a Sheet row is added', async () => {
    upsertItemModifierGroupsActionMock.mockResolvedValue({ ok: true });
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [],
      availableGroups,
    });
    fireEvent.click(screen.getByText('+ Добавить группу'));
    const addButtons = screen.getAllByText('+ Добавить');
    const firstAdd = addButtons[0];
    if (!firstAdd) throw new Error('expected at least one add button');
    await act(async () => {
      fireEvent.click(firstAdd);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(upsertItemModifierGroupsActionMock).toHaveBeenCalledWith(ITEM_ID, [GROUP_A]);
    });
  });

  it('opens the create-new dialog from the Sheet', () => {
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [],
      availableGroups,
    });
    fireEvent.click(screen.getByText('+ Добавить группу'));
    fireEvent.click(screen.getByText('+ Создать новую группу'));
    expect(screen.getByText('Создать группу модификаторов')).toBeInTheDocument();
  });

  it('navigates to the new group editor after quick-create succeeds', async () => {
    upsertModifierGroupActionMock.mockResolvedValue({ ok: true, id: 'new-group-id' });
    renderCard({
      itemId: ITEM_ID,
      initialModifierGroupIds: [],
      availableGroups,
    });
    fireEvent.click(screen.getByText('+ Добавить группу'));
    fireEvent.click(screen.getByText('+ Создать новую группу'));
    const nameField = screen.getByLabelText('Название');
    fireEvent.change(nameField, { target: { value: 'Новая' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Создать'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith('/dashboard/menu/modifier-groups/new-group-id');
    });
  });

  it('renders the ingredients input but typing into it does not trigger auto-sync', () => {
    renderCard({ itemId: ITEM_ID, initialModifierGroupIds: [], availableGroups: [] });
    const ingredientsInput = screen.getByLabelText(/Ингредиенты/u);
    fireEvent.change(ingredientsInput, { target: { value: 'курица, томат' } });
    expect(upsertItemModifierGroupsActionMock).not.toHaveBeenCalled();
  });
});
