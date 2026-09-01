import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { CreateTableZoneService } from './create-table-zone.service';
import { LocationTableLimitReachedError, TableBulkLimitExceededError } from '../domain/errors';
import type { TableZoneRepository, TableZoneWithTables } from '../domain/ports';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const LOCATION_ID = LocationId.parse('22222222-2222-4222-8222-222222222222');
const ZONE_ID = '33333333-3333-4333-8333-333333333333';

const buildRepo = (activeCount = 0): TableZoneRepository => ({
  listZonesWithTables: vi.fn(),
  findZoneById: vi.fn(),
  findTableById: vi.fn(),
  findActiveTableForResolution: vi.fn(),
  findActiveTableByQrToken: vi.fn(),
  openTableSession: vi.fn(),
  findLiveTableSession: vi.fn(),
  createZoneWithTables: vi.fn(),
  addTables: vi.fn(),
  saveZone: vi.fn(),
  saveTable: vi.fn(),
  archiveZoneCascade: vi.fn(),
  countActiveTables: vi.fn().mockResolvedValue(activeCount),
  maxOrdinalInZone: vi.fn(),
});

const runWithContext = <T>(op: () => Promise<T>): Promise<T> =>
  runInTenantContext({ tenantId: TENANT_ID, locationId: LOCATION_ID }, op);

describe('CreateTableZoneService', () => {
  it('refuses a batch above the bulk cap before any write', async () => {
    const repo = buildRepo();
    const service = new CreateTableZoneService(repo);

    await expect(
      runWithContext(() => service.execute({ name: 'Patio', tableCount: 201 })),
    ).rejects.toBeInstanceOf(TableBulkLimitExceededError);
    expect(repo.createZoneWithTables).not.toHaveBeenCalled();
  });

  it('refuses a batch that would push the location past its active-table cap', async () => {
    const repo = buildRepo(490);
    const service = new CreateTableZoneService(repo);

    await expect(
      runWithContext(() => service.execute({ name: 'Patio', tableCount: 20 })),
    ).rejects.toBeInstanceOf(LocationTableLimitReachedError);
    expect(repo.createZoneWithTables).not.toHaveBeenCalled();
  });

  it('creates a zone with sequential numbers and ordinals in order', async () => {
    const repo = buildRepo(0);
    const created: TableZoneWithTables = {
      id: ZONE_ID,
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      name: 'Patio',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      archivedAt: null,
      tables: [],
    };
    vi.mocked(repo.createZoneWithTables).mockResolvedValue(created);
    const service = new CreateTableZoneService(repo);

    await runWithContext(() => service.execute({ name: 'Patio', tableCount: 20 }));

    expect(repo.createZoneWithTables).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(repo.createZoneWithTables).mock.calls[0];
    if (!callArgs) throw new Error('createZoneWithTables was not called');
    const [input] = callArgs;

    expect(input.tables.map((table) => table.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => String(index + 1)),
    );
    expect(input.tables.map((table) => table.ordinal)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
});
