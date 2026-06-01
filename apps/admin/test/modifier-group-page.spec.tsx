import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const apiFetchInternalMock = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/api-server-internal', () => ({ apiFetchInternal: apiFetchInternalMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

vi.mock('../app/dashboard/(workspace)/menu/modifier-groups/[id]/group-editor-shell-client', () => ({
  GroupEditorShellClient: (props: {
    groupId: string;
    initialGroup: { name?: Record<string, string> } | null;
  }) => (
    <div data-testid="shell">
      <span data-testid="groupId">{props.groupId}</span>
      <span data-testid="hasGroup">{props.initialGroup ? 'yes' : 'no'}</span>
    </div>
  ),
}));

const { default: GroupEditorPage } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/[id]/page');

const VALID_ME = {
  ok: true,
  status: 200,
  data: { kind: 'operator', tenantId: 'tenant-1' },
};

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

describe('GroupEditorPage (Plan 04b-08 Task 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(VALID_ME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the shell with groupId='new' for /modifier-groups/new without hitting the api", async () => {
    const ui = await GroupEditorPage({ params: Promise.resolve({ id: 'new' }) });
    render(ui);
    expect(screen.getByTestId('groupId').textContent).toBe('new');
    expect(screen.getByTestId('hasGroup').textContent).toBe('no');
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('renders the shell prefilled for an existing group id', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        id: GROUP_ID,
        name: { ru: 'Соусы' },
        minSelectable: 0,
        maxSelectable: 3,
        options: [],
      },
    });
    const ui = await GroupEditorPage({ params: Promise.resolve({ id: GROUP_ID }) });
    render(ui);
    expect(screen.getByTestId('groupId').textContent).toBe(GROUP_ID);
    expect(screen.getByTestId('hasGroup').textContent).toBe('yes');
  });

  it('renders the not-found EmptyState on 404', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: false, status: 404, data: null });
    const ui = await GroupEditorPage({ params: Promise.resolve({ id: GROUP_ID }) });
    render(ui);
    expect(screen.getByText('Группа не найдена')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('redirects when /v1/me is not an operator', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, status: 200, data: { kind: 'customer' } });
    await expect(GroupEditorPage({ params: Promise.resolve({ id: 'new' }) })).rejects.toThrow(
      'redirect:/login',
    );
  });
});
