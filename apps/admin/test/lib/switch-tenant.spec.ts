import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

const { queryClientClearMock } = vi.hoisted(() => ({
  queryClientClearMock: vi.fn(),
}));
vi.mock('@/lib/query-client', () => ({ queryClient: { clear: queryClientClearMock } }));

const { switchTenant, TenantSwitchFailedError } = await import('@/lib/switch-tenant');
const { adminPath } = await import('@/lib/admin-path');

const originalLocation = window.location;
const switchTenantSourcePath = resolve(process.cwd(), 'src/lib/switch-tenant.ts');

describe('switchTenant', () => {
  let assignMock: ReturnType<typeof vi.fn>;
  let callOrder: string[];

  beforeEach(() => {
    apiFetchMock.mockReset();
    queryClientClearMock.mockReset();
    callOrder = [];
    queryClientClearMock.mockImplementation(() => callOrder.push('clear'));
    assignMock = vi.fn(() => callOrder.push('assign'));
    (window as { location: unknown }).location = { assign: assignMock };
  });

  afterEach(() => {
    (window as { location: unknown }).location = originalLocation;
  });

  it('POSTs the switch endpoint with the organization id', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { organizationId: 'org_1' } });

    await switchTenant('org_1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/switch-organization', {
      method: 'POST',
      body: { organizationId: 'org_1' },
    });
  });

  it('clears the query cache before navigating', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { organizationId: 'org_1' } });

    await switchTenant('org_1');

    expect(queryClientClearMock).toHaveBeenCalledOnce();
    expect(assignMock).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['clear', 'assign']);
  });

  it('performs a full document load, not a router navigation', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { organizationId: 'org_1' } });

    await switchTenant('org_1', '/dashboard');

    expect(assignMock).toHaveBeenCalledWith(adminPath('/dashboard'));

    const source = readFileSync(switchTenantSourcePath, 'utf-8');
    expect(source).not.toContain('@tanstack/react-router');
    expect(source).not.toContain('navigate');
  });

  it('throws and does not navigate when the switch fails', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });

    await expect(switchTenant('org_1')).rejects.toBeInstanceOf(TenantSwitchFailedError);
    expect(assignMock).not.toHaveBeenCalled();
    expect(queryClientClearMock).not.toHaveBeenCalled();
  });

  it('resolves the destination after the switch when given a callback', async () => {
    const order: string[] = [];
    apiFetchMock.mockImplementation(async () => {
      order.push('post');
      return { ok: true, status: 200, data: { organizationId: 'org_1' } };
    });
    const next = vi.fn(async () => {
      order.push('next');
      return '/pick-location?next=%2Fmenu';
    });

    await switchTenant('org_1', next);

    expect(order).toEqual(['post', 'next']);
    expect(assignMock).toHaveBeenCalledWith(adminPath('/pick-location?next=%2Fmenu'));
  });
});
