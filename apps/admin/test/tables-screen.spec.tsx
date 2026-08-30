import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TableZoneView } from '@/lib/queries/table-zones';

const { apiFetchMock, toastSuccessMock, toastErrorMock, printMock, downloadMock } = vi.hoisted(
  () => ({
    apiFetchMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    printMock: vi.fn(() => Promise.resolve()),
    downloadMock: vi.fn(() => Promise.resolve()),
  }),
);

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock('@/lib/qr/print-tables-sheet', () => ({ printTablesSheet: printMock }));
vi.mock('@/lib/qr/download-table-svg', () => ({ downloadTableSvg: downloadMock }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string, vars?: Record<string, unknown>) => {
        const full = opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key;
        return vars && Object.keys(vars).length > 0 ? `${full}(${JSON.stringify(vars)})` : full;
      },
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { EmptyState } = await import('@/components/common/empty-state');
const { ZoneDetail } = await import('@/components/tables/zone-detail');

const OWNER_ME = {
  status: 200,
  ok: true,
  data: {
    kind: 'operator' as const,
    userId: 'u-1',
    email: 'owner@demo.local',
    baseRole: 'owner' as const,
    permissions: {},
  },
};

const READ_ONLY_ME = {
  status: 200,
  ok: true,
  data: {
    kind: 'operator' as const,
    userId: 'u-2',
    email: 'staff@demo.local',
    baseRole: 'staff' as const,
    permissions: { table: ['read'] },
  },
};

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);

/**
 * Mirrors the zones.length ternary in the route component (locations.$slug.tables.tsx) — kept
 * here rather than mounting the whole TanStack Router tree, matching the existing convention of
 * testing a screen's rendered sub-components directly (test/catalog-spa.spec.tsx).
 */
function TablesBody({
  zones,
  locationId,
}: {
  readonly zones: readonly TableZoneView[];
  readonly locationId: string;
}): React.ReactElement {
  const [zone] = zones;
  if (zone === undefined) {
    return (
      <EmptyState variant="empty" title="tables.emptyTitle" description="tables.emptyDescription" />
    );
  }
  return <ZoneDetail zone={zone} locationId={locationId} />;
}

const oneZone = (tableCount: number): TableZoneView[] => [
  {
    id: 'zone-1',
    name: 'Terrace',
    status: 'active',
    tables: Array.from({ length: tableCount }, (_, i) => ({
      id: `table-${(i + 1).toString()}`,
      number: (i + 1).toString(),
      ordinal: i + 1,
      status: 'active' as const,
      qrUrl: `https://pizza.menu.resto.app/?t=table-${(i + 1).toString()}`,
    })),
  },
];

describe('tables screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(OWNER_ME);
  });

  it('renders the empty state at zero zones, with no zone list', async () => {
    render(
      <Wrap>
        <TablesBody zones={[]} locationId="loc-1" />
      </Wrap>,
    );

    expect(screen.getByText('tables.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('tables.emptyDescription')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders one zone and its table, with print and download actions present', async () => {
    render(
      <Wrap>
        <TablesBody zones={oneZone(1)} locationId="loc-1" />
      </Wrap>,
    );

    expect(screen.getByText('Terrace')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tables\.printAction/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /tables\.rowActionsAriaLabel/ }));
    expect(
      await screen.findByRole('menuitem', { name: /tables\.downloadAction/ }),
    ).toBeInTheDocument();
  });

  it('states the sheet ordering and the scan-to-verify line next to the print action', async () => {
    render(
      <Wrap>
        <TablesBody zones={oneZone(1)} locationId="loc-1" />
      </Wrap>,
    );

    expect(screen.getByText('tables.printOrderingLine')).toBeInTheDocument();
    expect(screen.getByText('tables.printVerifyLine')).toBeInTheDocument();
  });

  it('renders exactly the API order for a 50-table zone, not a lexicographic re-sort', async () => {
    render(
      <Wrap>
        <TablesBody zones={oneZone(50)} locationId="loc-1" />
      </Wrap>,
    );

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(50);

    const numbers = rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => (i + 1).toString()));
  });

  it('surfaces the mapped sentence for a failed mutation and hides the raw code', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/v1/me') return Promise.resolve(OWNER_ME);
      if (path === '/v1/tenancy/table-zones/zone-1/tables') {
        return Promise.resolve({
          status: 400,
          ok: false,
          data: {
            code: 'tenancy.table_bulk_limit_exceeded',
            message: 'Requested 500 tables in one batch, which exceeds the cap of 200.',
          },
        });
      }
      return Promise.resolve({ status: 200, ok: true, data: null });
    });

    render(
      <Wrap>
        <TablesBody zones={oneZone(1)} locationId="loc-1" />
      </Wrap>,
    );

    await user.click(await screen.findByRole('button', { name: /tables\.addTablesAction/ }));
    await user.click(screen.getByRole('button', { name: /tables\.addTablesSubmit/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A single request can create at most 200 tables');
    expect(screen.queryByText(/tenancy\.table_bulk_limit_exceeded/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/tenancy\.table_bulk_limit_exceeded/);
    expect(document.body.textContent).not.toMatch(/\bat Object\b|node_modules|\.tsx:\d/);
  });

  it('offers only list and download to a table:read-only member', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/v1/me') return Promise.resolve(READ_ONLY_ME);
      return Promise.resolve({ status: 200, ok: true, data: null });
    });

    render(
      <Wrap>
        <TablesBody zones={oneZone(1)} locationId="loc-1" />
      </Wrap>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/v1/me');
    });

    expect(await screen.findByRole('button', { name: /tables\.printAction/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tables\.addTablesAction/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /tables\.archiveZoneAction/ })).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /tables\.rowActionsAriaLabel/ }));

    expect(
      await screen.findByRole('menuitem', { name: /tables\.downloadAction/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /tables\.renameTableAction/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /tables\.archiveTableAction/ })).toBeNull();
  });
});
