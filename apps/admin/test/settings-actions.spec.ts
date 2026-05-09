import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const apiFetchMock = vi.fn();
const apiFetchInternalMock = vi.fn();

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/api-server-internal', () => ({ apiFetchInternal: apiFetchInternalMock }));

const { scheduleOffboardingAction, cancelOffboardingAction } =
  await import('../app/dashboard/settings/actions');

describe('settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scheduleOffboardingAction rejects non-owners', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { kind: 'operator', userId: 'u-1', tenantId: 't-1', baseRole: 'staff' },
    });
    const result = await scheduleOffboardingAction();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Owner role required/);
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('scheduleOffboardingAction posts with requestedBy=userId', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { kind: 'operator', userId: 'u-1', tenantId: 't-1', baseRole: 'owner' },
    });
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 202, data: {} });
    const result = await scheduleOffboardingAction();
    expect(result.ok).toBe(true);
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/tenants/t-1/offboard', {
      method: 'POST',
      body: { requestedBy: 'u-1' },
    });
  });

  it('scheduleOffboardingAction surfaces 409 friendly message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { kind: 'operator', userId: 'u-1', tenantId: 't-1', baseRole: 'owner' },
    });
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { detail: 'Tenant "t-1" cannot be offboarded from status "pending_offboarding".' },
    });
    const result = await scheduleOffboardingAction();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not in a state that allows/);
  });

  it('cancelOffboardingAction issues DELETE', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { kind: 'operator', userId: 'u-1', tenantId: 't-1', baseRole: 'owner' },
    });
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: {} });
    const result = await cancelOffboardingAction();
    expect(result.ok).toBe(true);
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/tenants/t-1/offboard', {
      method: 'DELETE',
    });
  });

  it('cancelOffboardingAction surfaces cool-off-expired message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { kind: 'operator', userId: 'u-1', tenantId: 't-1', baseRole: 'owner' },
    });
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: {
        detail: 'Cool-off window has expired for tenant "t-1"; cancellation is no longer possible.',
      },
    });
    const result = await cancelOffboardingAction();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Cool-off has expired/);
  });
});
