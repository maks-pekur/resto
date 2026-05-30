import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * AUTH-09 / D-16 drift-simulation spec.
 *
 * Mocks the access-control module to inject drifted role registrations
 * and asserts that `assertSystemRolesPresent` throws `SystemRoleDriftError`
 * with a diff that names the bad resource/action(s). Test 8 from the plan
 * (boot-time misconfiguration regression) is satisfied here at the unit
 * layer — the boot wiring in main.ts is one bare call, so the assertion's
 * throw IS the boot failure.
 */

describe('AUTH-09 D-16: assertSystemRolesPresent drift detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock('../../../src/contexts/identity/infrastructure/better-auth/access-control');
  });

  it('throws SystemRoleDriftError when admin loses a required permission', async () => {
    vi.doMock('../../../src/contexts/identity/infrastructure/better-auth/access-control', () => ({
      ac: { newRole: () => ({ statements: {} }) },
      ownerRole: {
        statements: {
          menu: ['read', 'create', 'update', 'delete'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          billing: ['read', 'update'],
          tenant: ['read', 'delete', 'transfer'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      adminRole: {
        // Drift: admin.menu missing 'delete' (regression scenario — a refactor
        // silently weakens admin's menu authority).
        statements: {
          menu: ['read', 'create', 'update'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          tenant: ['read'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      staffRole: { statements: { tenant: ['read'], brand: ['read'] } },
    }));
    const { assertSystemRolesPresent, SystemRoleDriftError } =
      await import('../../../src/bootstrap/assert-system-roles-present');
    expect(() => {
      assertSystemRolesPresent();
    }).toThrow(SystemRoleDriftError);
    try {
      assertSystemRolesPresent();
    } catch (err) {
      const drift = err as InstanceType<typeof SystemRoleDriftError>;
      expect(drift.diff.some((d) => d.includes('admin.menu'))).toBe(true);
    }
  });

  it('throws when admin is accidentally granted tenant:delete (escalation regression)', async () => {
    vi.doMock('../../../src/contexts/identity/infrastructure/better-auth/access-control', () => ({
      ac: { newRole: () => ({ statements: {} }) },
      ownerRole: {
        statements: {
          menu: ['read', 'create', 'update', 'delete'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          billing: ['read', 'update'],
          tenant: ['read', 'delete', 'transfer'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      adminRole: {
        statements: {
          menu: ['read', 'create', 'update', 'delete'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          // Drift: admin granted 'delete' on tenant — the exact escalation
          // packages/domain/CLAUDE.md regression rule was written to catch.
          tenant: ['read', 'delete'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      staffRole: { statements: { tenant: ['read'], brand: ['read'] } },
    }));
    const { assertSystemRolesPresent, SystemRoleDriftError } =
      await import('../../../src/bootstrap/assert-system-roles-present');
    expect(() => {
      assertSystemRolesPresent();
    }).toThrow(SystemRoleDriftError);
  });

  it('error message names which role/resource drifted (operator-readable)', async () => {
    vi.doMock('../../../src/contexts/identity/infrastructure/better-auth/access-control', () => ({
      ac: { newRole: () => ({ statements: {} }) },
      ownerRole: {
        statements: {
          menu: ['read', 'create', 'update', 'delete'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          billing: ['read', 'update'],
          tenant: ['read', 'delete', 'transfer'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      adminRole: {
        statements: {
          menu: ['read', 'create', 'update', 'delete'],
          order: ['read', 'update-status'],
          staff: ['invite', 'remove', 'role:create', 'role:update'],
          reports: ['read'],
          settings: ['update'],
          tenant: ['read'],
          brand: ['read', 'create', 'update', 'delete'],
        },
      },
      // Drift: staff has an extra resource action.
      staffRole: { statements: { tenant: ['read'], brand: ['read', 'create'] } },
    }));
    const { assertSystemRolesPresent } =
      await import('../../../src/bootstrap/assert-system-roles-present');
    let captured: Error | undefined;
    try {
      assertSystemRolesPresent();
    } catch (err) {
      captured = err as Error;
    }
    expect(captured).toBeDefined();
    expect(captured?.message).toMatch(/staff\.brand/);
    expect(captured?.message).toContain('refusing to start');
  });
});
