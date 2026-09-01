import { describe, expect, it, vi } from 'vitest';
import { LocationId, TenantId } from '@resto/domain';
import { ArchiveLocationService } from '../../../src/contexts/tenancy/application/archive-location.service';
import { LocationNotFoundError } from '../../../src/contexts/tenancy/domain/errors';
import type { LocationRepository } from '../../../src/contexts/tenancy/domain/ports';
import type { LocationSnapshot } from '../../../src/contexts/tenancy/domain/location.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const LOCATION_ID = LocationId.parse('33333333-3333-4333-8333-333333333333');

const buildSnapshot = (over: Partial<LocationSnapshot> = {}): LocationSnapshot => ({
  id: LOCATION_ID,
  tenantId: TENANT_ID,
  name: 'Kitchen One',
  slug: 'kitchen-one',
  address: null,
  latitude: null,
  longitude: null,
  timezone: null,
  contacts: null,
  openingHours: null,
  wifi: null,
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  archivedAt: null,
  ...over,
});

const buildRepo = (): LocationRepository => ({
  findById: vi.fn(),
  listForTenant: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  countScopedMembers: vi.fn().mockResolvedValue(0),
  deleteEmpty: vi.fn().mockResolvedValue(undefined),
});

describe('ArchiveLocationService', () => {
  it('soft-archives the location and returns the scoped-member count', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findById).mockResolvedValue(buildSnapshot());
    vi.mocked(repo.countScopedMembers).mockResolvedValue(3);
    const service = new ArchiveLocationService(repo);

    const result = await service.execute(LOCATION_ID);

    expect(result).toEqual({ scopedMemberCount: 3 });
    const saved = vi.mocked(repo.save).mock.calls[0]?.[0];
    expect(saved).toMatchObject({ id: LOCATION_ID, status: 'archived' });
    expect(saved?.archivedAt).toBeInstanceOf(Date);
  });

  it('does not block archive when staff are scoped to the location (D-17) and does not touch member_location_scope', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findById).mockResolvedValue(buildSnapshot());
    vi.mocked(repo.countScopedMembers).mockResolvedValue(5);
    const service = new ArchiveLocationService(repo);

    await expect(service.execute(LOCATION_ID)).resolves.toEqual({ scopedMemberCount: 5 });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('calls countScopedMembers for the target location', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findById).mockResolvedValue(buildSnapshot());
    const service = new ArchiveLocationService(repo);

    await service.execute(LOCATION_ID);

    expect(repo.countScopedMembers).toHaveBeenCalledWith(LOCATION_ID);
  });

  it('throws LocationNotFoundError when the location does not exist', async () => {
    const repo = buildRepo();
    vi.mocked(repo.findById).mockResolvedValue(null);
    const service = new ArchiveLocationService(repo);

    await expect(service.execute(LOCATION_ID)).rejects.toBeInstanceOf(LocationNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.countScopedMembers).not.toHaveBeenCalled();
  });
});
