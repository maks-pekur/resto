import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { containsNonDelegatable } from '@resto/domain';
import { PRESET_ROLES } from '@resto/domain';
import { SeedPresetRolesService } from '../../../src/contexts/identity/application/seed-preset-roles.service';

describe('PRESET_ROLES', () => {
  it('exports exactly 3 presets', () => {
    expect(PRESET_ROLES).toHaveLength(3);
  });

  it('preset slugs are not reserved system slugs (owner/admin/staff)', () => {
    const reserved = new Set(['owner', 'admin', 'staff']);
    for (const preset of PRESET_ROLES) {
      expect(reserved.has(preset.slug)).toBe(false);
    }
  });

  it('no preset contains any NON_DELEGATABLE permission', () => {
    for (const preset of PRESET_ROLES) {
      expect(containsNonDelegatable(preset.permission)).toBe(false);
    }
  });

  it('manager preset has expected slug', () => {
    const manager = PRESET_ROLES.find((p) => p.slug === 'manager');
    expect(manager).toBeDefined();
    expect(manager?.permission.menu).toContain('read');
  });

  it('cashier-foh preset has expected slug', () => {
    expect(PRESET_ROLES.find((p) => p.slug === 'cashier-foh')).toBeDefined();
  });

  it('kitchen preset has expected slug', () => {
    expect(PRESET_ROLES.find((p) => p.slug === 'kitchen')).toBeDefined();
  });

  it('every preset grants order:cancel', () => {
    for (const preset of PRESET_ROLES) {
      expect(preset.permission.order, `${preset.slug} missing order`).toContain('cancel');
    }
  });
});

describe('SeedPresetRolesService', () => {
  const makeAuthDb = (existingRoles: string[]) => ({
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existingRoles.map((role) => ({ role }))),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    },
  });

  it('issues 3 INSERT calls for a fresh organization', async () => {
    const authDb = makeAuthDb([]);
    const svc = new SeedPresetRolesService(authDb as never);
    await svc.execute({ tenantId: '00000000-0000-0000-0000-000000000001' });
    expect(authDb.db.insert).toHaveBeenCalledTimes(3);
  });

  it('issues 0 INSERT calls when all 3 presets already exist (idempotent)', async () => {
    const authDb = makeAuthDb(['manager', 'cashier-foh', 'kitchen']);
    const svc = new SeedPresetRolesService(authDb as never);
    await svc.execute({ tenantId: '00000000-0000-0000-0000-000000000001' });
    expect(authDb.db.insert).not.toHaveBeenCalled();
  });

  it('inserts only missing presets when some already exist', async () => {
    const authDb = makeAuthDb(['manager']);
    const svc = new SeedPresetRolesService(authDb as never);
    await svc.execute({ tenantId: '00000000-0000-0000-0000-000000000001' });
    expect(authDb.db.insert).toHaveBeenCalledTimes(2);
  });
});
