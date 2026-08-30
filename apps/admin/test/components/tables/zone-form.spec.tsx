import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { createMock, renameMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  renameMock: vi.fn(),
}));

vi.mock('@/lib/queries/table-zones', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/queries/table-zones');
  return {
    ...actual,
    createTableZoneMutation: createMock,
    renameTableZoneMutation: renameMock,
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/back">{children}</a>,
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { ZoneForm } = await import('@/components/tables/zone-form');

const renderForm = (props: Record<string, unknown> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ZoneForm locationId="loc-1" locationSlug="central" {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  createMock.mockReset();
  renameMock.mockReset();
  createMock.mockResolvedValue({ status: 200, ok: true, data: { id: 'zone-9' } });
  renameMock.mockResolvedValue({ status: 200, ok: true, data: null });
});

describe('ZoneForm', () => {
  it('refuses an empty name and says why, in the field and in a summary', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'tables.form.create' }));

    await waitFor(() => {
      expect(screen.getAllByText('tables.form.nameRequired').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('tables.form.summaryTitle')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates the zone and hands back the id it was given', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderForm({ onCreated });

    await user.type(screen.getByLabelText(/tables\.zoneNameLabel/), 'Terrace');
    await user.click(screen.getByRole('button', { name: 'tables.form.create' }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('zone-9');
    });
    expect(createMock).toHaveBeenCalledWith('loc-1', { name: 'Terrace', tableCount: 4 });
  });

  it('renames rather than creates when it opens on an existing zone', async () => {
    const user = userEvent.setup();
    renderForm({ zone: { id: 'zone-1', name: 'Terrace', status: 'active', tables: [] } });

    const input = screen.getByLabelText(/tables\.zoneNameLabel/);
    await user.clear(input);
    await user.type(input, 'Veranda');
    await user.click(screen.getByRole('button', { name: 'tables.form.save' }));

    await waitFor(() => {
      expect(renameMock).toHaveBeenCalledWith('loc-1', 'zone-1', 'Veranda');
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('asks for a table count only while creating', () => {
    renderForm({ zone: { id: 'zone-1', name: 'Terrace', status: 'active', tables: [] } });

    expect(screen.queryByLabelText('tables.tableCountLabel')).not.toBeInTheDocument();
  });

  it('surfaces a refused save without losing what was typed', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      status: 409,
      ok: false,
      data: { code: 'tenancy.zone_name_taken', message: 'taken' },
    });
    renderForm();

    await user.type(screen.getByLabelText(/tables\.zoneNameLabel/), 'Terrace');
    await user.click(screen.getByRole('button', { name: 'tables.form.create' }));

    await waitFor(() => {
      expect(screen.getByText('tables.form.summaryTitle')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/tables\.zoneNameLabel/)).toHaveValue('Terrace');
  });
});
