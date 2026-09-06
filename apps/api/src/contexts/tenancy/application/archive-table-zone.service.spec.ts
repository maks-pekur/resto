import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocationId, TenantId } from '@resto/domain';
import { ArchiveTableZoneService } from './archive-table-zone.service';
import { TableZoneAlreadyArchivedError, TableZoneNotFoundError } from '../domain/errors';
import type { TableZoneRepository } from '../domain/ports';
import type { TableZoneSnapshot } from '../domain/table-zone.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const LOCATION_ID = LocationId.parse('22222222-2222-4222-8222-222222222222');
const ZONE_ID = '33333333-3333-4333-8333-333333333333';

const buildZoneSnapshot = (status: 'active' | 'archived' = 'active'): TableZoneSnapshot => ({
  id: ZONE_ID,
  tenantId: TENANT_ID,
  locationId: LOCATION_ID,
  name: 'Patio',
  status,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  archivedAt: status === 'archived' ? new Date('2026-01-02T00:00:00Z') : null,
});

const buildRepo = (): TableZoneRepository => ({
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
  countActiveTables: vi.fn(),
  maxOrdinalInZone: vi.fn(),
});

const runWithContext = <T>(op: () => Promise<T>): Promise<T> =>
  runInTenantContext({ tenantId: TENANT_ID, locationId: LOCATION_ID }, op);

describe('ArchiveTableZoneService', () => {
  it('archives a zone and its tables in one repository call, never per-table', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findZoneById).mockResolvedValue(buildZoneSnapshot('active'));
    vi.mocked(repo.archiveZoneCascade).mockResolvedValue({
      zoneId: ZONE_ID,
      archivedTableCount: 4,
    });
    const service = new ArchiveTableZoneService(repo);

    const result = await runWithContext(() => service.execute({ zoneId: ZONE_ID }));

    expect(result).toEqual({ zoneId: ZONE_ID, archivedTableCount: 4 });
    expect(repo.archiveZoneCascade).toHaveBeenCalledTimes(1);
    expect(repo.archiveZoneCascade).toHaveBeenCalledWith(ZONE_ID, LOCATION_ID);
    expect(repo.saveTable).not.toHaveBeenCalled();
  });

  it('refuses to archive an already-archived zone and calls nothing', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findZoneById).mockResolvedValue(buildZoneSnapshot('archived'));
    const service = new ArchiveTableZoneService(repo);

    await expect(runWithContext(() => service.execute({ zoneId: ZONE_ID }))).rejects.toBeInstanceOf(
      TableZoneAlreadyArchivedError,
    );
    expect(repo.archiveZoneCascade).not.toHaveBeenCalled();
    expect(repo.saveTable).not.toHaveBeenCalled();
    expect(repo.saveZone).not.toHaveBeenCalled();
  });

  it('throws when the zone id does not belong to the bound location', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findZoneById).mockResolvedValue(null);
    const service = new ArchiveTableZoneService(repo);

    await expect(runWithContext(() => service.execute({ zoneId: ZONE_ID }))).rejects.toBeInstanceOf(
      TableZoneNotFoundError,
    );
    expect(repo.archiveZoneCascade).not.toHaveBeenCalled();
  });
});
