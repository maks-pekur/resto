import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { reorderCategoryAction } =
  await import('../app/dashboard/(workspace)/menu/categories/reorder-category-action');

const PARENT = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const listResponse = {
  items: [
    {
      id: PARENT,
      parentId: null,
      slug: 'napitki',
      name: { ru: 'Напитки' },
      description: null,
      sortOrder: 0,
      status: 'published',
    },
    {
      id: A,
      parentId: PARENT,
      slug: 'cofe',
      name: { ru: 'Кофе' },
      description: null,
      sortOrder: 0,
      status: 'published',
    },
    {
      id: B,
      parentId: PARENT,
      slug: 'chay',
      name: { ru: 'Чай' },
      description: null,
      sortOrder: 1,
      status: 'published',
    },
    {
      id: C,
      parentId: PARENT,
      slug: 'sok',
      name: { ru: 'Сок' },
      description: null,
      sortOrder: 2,
      status: 'published',
    },
  ],
};

interface FetchOpts {
  method?: string;
  body?: {
    id?: string;
    name?: { ru?: string };
    parentId?: string | null;
    sortOrder?: number;
  };
}

const mockFetch = (
  path: string,
  opts?: FetchOpts,
): { ok: boolean; status: number; data: unknown } => {
  if (path === '/internal/v1/catalog/categories' && !opts?.method) {
    return { ok: true, status: 200, data: listResponse };
  }
  return { ok: true, status: 200, data: { id: 'ok' } };
};

const postCallsOf = (): FetchOpts[] => {
  const all = apiFetchInternalMock.mock.calls as unknown as [string, FetchOpts | undefined][];
  const result: FetchOpts[] = [];
  for (const c of all) {
    const opts = c[1];
    if (opts?.method === 'POST') result.push(opts);
  }
  return result;
};

describe('reorderCategoryAction (Plan 04b-05 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('swaps sortOrder of current row and its DOWN neighbour via two upsert POSTs', async () => {
    apiFetchInternalMock.mockImplementation((path: string, opts?: FetchOpts) =>
      Promise.resolve(mockFetch(path, opts)),
    );
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: A, direction: 'down' },
    );
    expect(res).toEqual({ error: null, success: true });
    const postCalls = postCallsOf();
    expect(postCalls).toHaveLength(2);
    expect(postCalls[0]?.body).toEqual({
      id: A,
      name: { ru: 'Кофе' },
      parentId: PARENT,
      sortOrder: 1,
    });
    expect(postCalls[1]?.body).toEqual({
      id: B,
      name: { ru: 'Чай' },
      parentId: PARENT,
      sortOrder: 0,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('swaps sortOrder of current row and its UP neighbour', async () => {
    apiFetchInternalMock.mockImplementation((path: string, opts?: FetchOpts) =>
      Promise.resolve(mockFetch(path, opts)),
    );
    await reorderCategoryAction({ error: null, success: false }, { id: B, direction: 'up' });
    const postCalls = postCallsOf();
    expect(postCalls[0]?.body?.id).toBe(B);
    expect(postCalls[0]?.body?.sortOrder).toBe(0);
    expect(postCalls[1]?.body?.id).toBe(A);
    expect(postCalls[1]?.body?.sortOrder).toBe(1);
  });

  it('returns no-op success when target is already at the top (no UP neighbour)', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: listResponse,
    });
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: A, direction: 'up' },
    );
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchInternalMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns no-op success when target is already at the bottom (no DOWN neighbour)', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: listResponse,
    });
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: C, direction: 'down' },
    );
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchInternalMock).toHaveBeenCalledTimes(1);
  });

  it('returns "Категория не найдена" when the id does not exist in the list', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: listResponse,
    });
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', direction: 'down' },
    );
    expect(res.error).toBe('Категория не найдена.');
    expect(res.success).toBe(false);
  });

  it('surfaces 5xx from the GET as a Russian server error', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
    });
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: A, direction: 'down' },
    );
    expect(res.error).toMatch(/Серверная ошибка/u);
  });

  it('surfaces failure of the first upsert POST (best-effort; second never fires)', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: listResponse,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: null,
      });
    const res = await reorderCategoryAction(
      { error: null, success: false },
      { id: A, direction: 'down' },
    );
    expect(res.error).toMatch(/Серверная ошибка/u);
    expect(res.success).toBe(false);
    expect(apiFetchInternalMock).toHaveBeenCalledTimes(2);
  });
});
