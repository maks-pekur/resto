import { describe, expect, it, vi, beforeEach } from 'vitest';

const cookiesSetMock = vi.fn();
const cookiesDeleteMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookiesSetMock, delete: cookiesDeleteMock })),
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { setActiveBrandAction } = await import('../lib/actions/set-active-brand');

describe('setActiveBrandAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets resto.active_brand cookie when given a slug', async () => {
    const result = await setActiveBrandAction('z-burger');
    expect(result).toEqual({ ok: true });
    expect(cookiesSetMock).toHaveBeenCalledWith('resto.active_brand', 'z-burger', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(cookiesDeleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard', 'layout');
  });

  it('clears resto.active_brand cookie when given null (All brands mode)', async () => {
    const result = await setActiveBrandAction(null);
    expect(result).toEqual({ ok: true });
    expect(cookiesDeleteMock).toHaveBeenCalledWith('resto.active_brand');
    expect(cookiesSetMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard', 'layout');
  });

  it('rejects an invalid slug shape without setting the cookie', async () => {
    const result = await setActiveBrandAction('NOT a slug');
    expect(result.ok).toBe(false);
    expect(cookiesSetMock).not.toHaveBeenCalled();
    expect(cookiesDeleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
