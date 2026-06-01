import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertModifierOptionAction } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/upsert-modifier-option-action');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';

interface CallShape {
  readonly body: Record<string, unknown>;
}

const lastCallBody = (): Record<string, unknown> => {
  const first = apiFetchInternalMock.mock.calls[0] as readonly [string, CallShape] | undefined;
  if (!first) throw new Error('apiFetchInternal was not invoked');
  return first[1].body;
};

describe('upsertModifierOptionAction (Plan 04b-08 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs with toLocalizedText name + toFixed(2) priceDelta + groupId', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: OPTION_ID } });
    await upsertModifierOptionAction({
      groupId: GROUP_ID,
      values: { name: 'Карамель', priceDelta: 1.5, defaultAmount: 0, freeAmount: 0 },
    });
    const body = lastCallBody();
    expect(body.name).toEqual({ ru: 'Карамель' });
    expect(body.priceDelta).toBe('1.50');
    expect(body.groupId).toBe(GROUP_ID);
    expect(body.id).toBeUndefined();
  });

  it('attaches optionId for updates', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: OPTION_ID } });
    await upsertModifierOptionAction({
      groupId: GROUP_ID,
      optionId: OPTION_ID,
      values: { name: 'Карамель', priceDelta: 1.5, defaultAmount: 0, freeAmount: 0 },
    });
    expect(lastCallBody().id).toBe(OPTION_ID);
  });

  it('revalidates the editor path and menu layout on success', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: OPTION_ID } });
    await upsertModifierOptionAction({
      groupId: GROUP_ID,
      values: { name: 'X', priceDelta: 0, defaultAmount: 0, freeAmount: 0 },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/menu/modifier-groups/${GROUP_ID}`);
  });

  it('short-circuits when the form fails validation', async () => {
    const res = await upsertModifierOptionAction({
      groupId: GROUP_ID,
      values: { name: '  ', priceDelta: 0, defaultAmount: 0, freeAmount: 0 },
    });
    expect(res.ok).toBe(false);
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('surfaces api errors and skips revalidation', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const res = await upsertModifierOptionAction({
      groupId: GROUP_ID,
      values: { name: 'X', priceDelta: 0, defaultAmount: 0, freeAmount: 0 },
    });
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
