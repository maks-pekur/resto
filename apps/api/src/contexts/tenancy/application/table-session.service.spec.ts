import { describe, expect, it, vi } from 'vitest';
import { LocationId } from '@resto/domain';
import { TableSessionService, TABLE_SESSION_TTL_MS } from './table-session.service';
import { RestaurantTableNotFoundError } from '../domain/errors';
import type { TableZoneRepository } from '../domain/ports';

const TABLE = {
  tableId: '11111111-1111-4111-8111-111111111111',
  zoneName: 'Веранда',
  number: '12',
  locationId: LocationId.parse('22222222-2222-4222-8222-222222222222'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

const buildRepo = (over: Partial<TableZoneRepository> = {}): TableZoneRepository =>
  ({
    findActiveTableByQrToken: vi.fn().mockResolvedValue(TABLE),
    openTableSession: vi.fn().mockResolvedValue('session-1'),
    findLiveTableSession: vi.fn().mockResolvedValue(TABLE),
    ...over,
  }) as unknown as TableZoneRepository;

describe('TableSessionService', () => {
  it('exchanges the code on the table for a session that expires', async () => {
    const repo = buildRepo();
    const now = new Date('2026-09-01T12:00:00Z');

    const opened = await new TableSessionService(repo).open('a-printed-secret', now);

    expect(opened.tableId).toBe(TABLE.tableId);
    expect(opened.sessionId).toBe('session-1');
    expect(opened.expiresAt.getTime()).toBe(now.getTime() + TABLE_SESSION_TTL_MS);
    expect(repo.openTableSession).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: TABLE.tableId, locationId: TABLE.locationId }),
    );
  });

  it('refuses a secret no live table answers to', async () => {
    const repo = buildRepo({ findActiveTableByQrToken: vi.fn().mockResolvedValue(null) });

    await expect(new TableSessionService(repo).open('someone-elses-code')).rejects.toBeInstanceOf(
      RestaurantTableNotFoundError,
    );
  });

  it('answers nothing for a session that has lapsed', async () => {
    const repo = buildRepo({ findLiveTableSession: vi.fn().mockResolvedValue(null) });

    await expect(new TableSessionService(repo).resolve('old-session')).resolves.toBeNull();
  });

  it('names the table a live session sits at', async () => {
    const service = new TableSessionService(buildRepo());

    await expect(service.resolve('session-1')).resolves.toEqual({
      tableId: TABLE.tableId,
      locationId: TABLE.locationId,
      zoneName: 'Веранда',
      number: '12',
    });
  });
});
