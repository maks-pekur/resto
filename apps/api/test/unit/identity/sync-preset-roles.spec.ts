import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PRESET_ROLES } from '@resto/domain';
import { SyncPresetRolesService } from '../../../src/contexts/identity/application/sync-preset-roles.service';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

interface ExistingRow {
  readonly id: string;
  readonly role: string;
  readonly permission: string;
  readonly archivedAt: Date | null;
}

const makeAuthDb = (rows: ExistingRow[]) => {
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      }),
      update,
      insert,
    },
  };
};

const stalePermission = (slug: string): string =>
  JSON.stringify({ ...PRESET_ROLES.find((p) => p.slug === slug)?.permission, order: ['read'] });

describe('SyncPresetRolesService', () => {
  it('inserts all 3 presets for an organization with none provisioned', async () => {
    const authDb = makeAuthDb([]);
    const svc = new SyncPresetRolesService(authDb as never);
    const result = await svc.execute({ organizationId: ORG_ID });
    expect(authDb.db.insert).toHaveBeenCalledTimes(3);
    expect(authDb.db.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      organizationId: ORG_ID,
      updated: 0,
      inserted: 3,
      skippedArchived: 0,
    });
  });

  it('updates rows whose stored permission is stale (missing order:cancel)', async () => {
    const authDb = makeAuthDb(
      PRESET_ROLES.map((p) => ({
        id: `id-${p.slug}`,
        role: p.slug,
        permission: stalePermission(p.slug),
        archivedAt: null,
      })),
    );
    const svc = new SyncPresetRolesService(authDb as never);
    const result = await svc.execute({ organizationId: ORG_ID });
    expect(authDb.db.update).toHaveBeenCalledTimes(3);
    expect(authDb.db.insert).not.toHaveBeenCalled();
    expect(result.updated).toBe(3);
    expect(result.inserted).toBe(0);
    expect(result.skippedArchived).toBe(0);
  });

  it('is idempotent — second sync with already-current rows issues 0 writes', async () => {
    const authDb = makeAuthDb(
      PRESET_ROLES.map((p) => ({
        id: `id-${p.slug}`,
        role: p.slug,
        permission: JSON.stringify(p.permission),
        archivedAt: null,
      })),
    );
    const svc = new SyncPresetRolesService(authDb as never);
    const result = await svc.execute({ organizationId: ORG_ID });
    expect(authDb.db.update).not.toHaveBeenCalled();
    expect(authDb.db.insert).not.toHaveBeenCalled();
    expect(result).toEqual({
      organizationId: ORG_ID,
      updated: 0,
      inserted: 0,
      skippedArchived: 0,
    });
  });

  it('skips a role the owner archived — never resurrects it (D-12)', async () => {
    const authDb = makeAuthDb([
      {
        id: 'id-manager',
        role: 'manager',
        permission: stalePermission('manager'),
        archivedAt: new Date(),
      },
      {
        id: 'id-cashier-foh',
        role: 'cashier-foh',
        permission: JSON.stringify(PRESET_ROLES.find((p) => p.slug === 'cashier-foh')?.permission),
        archivedAt: null,
      },
    ]);
    const svc = new SyncPresetRolesService(authDb as never);
    const result = await svc.execute({ organizationId: ORG_ID });
    expect(authDb.db.update).not.toHaveBeenCalled();
    // kitchen is missing entirely → inserted; manager archived → skipped;
    // cashier-foh already current → no-op.
    expect(authDb.db.insert).toHaveBeenCalledTimes(1);
    expect(result.skippedArchived).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
  });
});
