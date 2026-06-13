import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server', () => ({
  apiFetch: apiFetchMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertModifierGroupAction } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/upsert-modifier-group-action');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const validValues = { name: 'Соусы', minSelectable: 0, maxSelectable: 3 };

interface CallShape {
  readonly body: Record<string, unknown>;
}

const lastCallBody = (): Record<string, unknown> => {
  const first = apiFetchMock.mock.calls[0] as readonly [string, CallShape] | undefined;
  if (!first) throw new Error('apiFetch was not invoked');
  return first[1].body;
};

describe('upsertModifierGroupAction (Plan 04b-08 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new group, revalidates layout + detail path', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { id: GROUP_ID } });
    const res = await upsertModifierGroupAction({ values: validValues });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/catalog/modifier-groups',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/menu/modifier-groups/${GROUP_ID}`);
    expect(res).toEqual({ ok: true, id: GROUP_ID });
  });

  it('attaches groupId as id for existing groups; omits id for new ones', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { id: GROUP_ID } });
    await upsertModifierGroupAction({ groupId: GROUP_ID, values: validValues });
    expect(lastCallBody().id).toBe(GROUP_ID);
  });

  it('wraps the name with toLocalizedText', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { id: GROUP_ID } });
    await upsertModifierGroupAction({ values: validValues });
    expect(lastCallBody().name).toEqual({ ru: 'Соусы' });
  });

  it('short-circuits when the form fails validation', async () => {
    const res = await upsertModifierGroupAction({
      values: { name: '   ', minSelectable: 0, maxSelectable: 0 },
    });
    expect(res.ok).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits when min > max (refine)', async () => {
    const res = await upsertModifierGroupAction({
      values: { name: 'X', minSelectable: 3, maxSelectable: 1 },
    });
    expect(res.ok).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('surfaces api errors and skips revalidation on failure', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'catalog.modifier_group_conflict' },
    });
    const res = await upsertModifierGroupAction({ values: validValues });
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
