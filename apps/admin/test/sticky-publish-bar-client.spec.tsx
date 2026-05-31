import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const schedulePublishActionMock = vi.fn();
const cancelPublishActionMock = vi.fn();
const toastCustomMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/menu/schedule-publish-action', () => ({
  schedulePublishAction: schedulePublishActionMock,
}));
vi.mock('@/lib/menu/cancel-publish-action', () => ({
  cancelPublishAction: cancelPublishActionMock,
}));
vi.mock('sonner', () => ({
  toast: {
    custom: toastCustomMock,
    success: toastSuccessMock,
    info: toastInfoMock,
    error: toastErrorMock,
  },
}));

const { StickyPublishBarClient } = await import('../components/menu/sticky-publish-bar-client');
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DraftDiffEntry } from '@/lib/menu/types';

const sampleDiff: DraftDiffEntry[] = [
  { entityType: 'item', id: 'i-1', name: 'Капучино', status: 'draft' },
  { entityType: 'item', id: 'i-2', name: 'Латте', status: 'modified' },
  { entityType: 'category', id: 'c-1', name: 'Напитки', status: 'draft' },
];

const renderBar = (
  props: Partial<React.ComponentProps<typeof StickyPublishBarClient>> = {},
): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <StickyPublishBarClient
        unpublishedCount={props.unpublishedCount ?? 3}
        diffItems={props.diffItems ?? sampleDiff}
        truncatedCount={props.truncatedCount}
      />
    </TooltipProvider>,
  );

describe('StickyPublishBarClient (D-4b-03, UI-SPEC §Sticky Publish Bar Spec)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when unpublishedCount is 0 (UI-SPEC: hidden when no diff)', () => {
    const { container } = renderBar({ unpublishedCount: 0, diffItems: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders the published-count with correct Russian plural form', () => {
    renderBar({ unpublishedCount: 3 });
    expect(screen.getByText(/3 неопубликованных изменения/u)).toBeInTheDocument();
  });

  it('renders role="region" with aria-label "Управление публикацией"', () => {
    renderBar();
    expect(screen.getByRole('region', { name: 'Управление публикацией' })).toBeInTheDocument();
  });

  it('renders the primary "Опубликовать меню" button (default variant)', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Опубликовать меню' })).toBeInTheDocument();
  });

  it('on publish click: calls schedulePublishAction, mounts countdown toast with id "publish-countdown"', async () => {
    schedulePublishActionMock.mockResolvedValue({ ok: true, scheduledAt: 1, error: null });
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Опубликовать меню' }));
    await waitFor(() => {
      expect(schedulePublishActionMock).toHaveBeenCalled();
    });
    expect(toastCustomMock).toHaveBeenCalled();
    const callArgs = toastCustomMock.mock.calls[0];
    if (!callArgs) throw new Error('toast.custom was not called');
    const options = callArgs[1] as { id: string; duration: number };
    expect(options.id).toBe('publish-countdown');
    expect(options.duration).toBe(Infinity);
  });

  it('on publish failure: surfaces toast.error with constant id, button re-enables', async () => {
    schedulePublishActionMock.mockResolvedValue({
      ok: false,
      scheduledAt: null,
      error: 'Не удалось опубликовать — проверьте соединение',
    });
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Опубликовать меню' }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    const errorCall = toastErrorMock.mock.calls[0];
    if (!errorCall) throw new Error('toast.error was not called');
    expect(errorCall[0]).toBe('Не удалось опубликовать — проверьте соединение');
    expect((errorCall[1] as { id: string }).id).toBe('publish-countdown');
    expect(screen.getByRole('button', { name: 'Опубликовать меню' })).not.toBeDisabled();
  });

  it('toggle "Показать ▾" reveals the inline diff list (max-h-64 overflow-auto)', async () => {
    const user = userEvent.setup();
    renderBar();
    const trigger = screen.getByRole('button', { name: /Показать/u });
    await user.click(trigger);
    expect(screen.getByText('Капучино')).toBeInTheDocument();
    expect(screen.getByText('Латте')).toBeInTheDocument();
    expect(screen.getByText('Напитки')).toBeInTheDocument();
  });

  it('shows "+ ещё N" footer when truncatedCount > 0', async () => {
    const user = userEvent.setup();
    renderBar({ truncatedCount: 7 });
    await user.click(screen.getByRole('button', { name: /Показать/u }));
    expect(screen.getByText('+ ещё 7')).toBeInTheDocument();
  });
});
