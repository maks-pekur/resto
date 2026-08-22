import { describe, expect, it } from 'vitest';
import { SYSTEM_ROLES } from '@resto/domain';
import {
  assertSystemRolesPresent,
  SystemRoleDriftError,
} from '../../../src/bootstrap/assert-system-roles-present';

describe('AUTH-09 D-16: SYSTEM_ROLES regression', () => {
  describe('admin denied permissions (packages/domain CLAUDE.md mandate)', () => {
    it('does NOT contain tenant:delete', () => {
      expect(SYSTEM_ROLES.admin.tenant ?? []).not.toContain('delete');
    });

    it('does NOT contain tenant:transfer', () => {
      expect(SYSTEM_ROLES.admin.tenant ?? []).not.toContain('transfer');
    });

    it('does NOT receive billing:update (owner-only)', () => {
      const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
      expect(admin.billing).toBeUndefined();
    });

    it('does NOT have ac resource — owner-only per D-01 (08.3)', () => {
      const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
      expect(admin.ac).toBeUndefined();
    });
  });

  describe('owner-only resources (D-01 08.3)', () => {
    it('owner has ac resource with create/read/update/delete', () => {
      const owner = SYSTEM_ROLES.owner as Record<string, readonly string[] | undefined>;
      expect(owner.ac).toEqual(['create', 'read', 'update', 'delete']);
    });
  });

  describe('containment owner ⊇ admin ⊇ staff', () => {
    it('owner contains every admin permission', () => {
      for (const [resource, actions] of Object.entries(SYSTEM_ROLES.admin)) {
        const ownerActions =
          (SYSTEM_ROLES.owner as Record<string, readonly string[] | undefined>)[resource] ?? [];
        for (const action of actions ?? []) {
          expect(
            ownerActions,
            `owner.${resource} should contain ${action} (admin has it)`,
          ).toContain(action);
        }
      }
    });

    it('admin contains every staff permission', () => {
      for (const [resource, actions] of Object.entries(SYSTEM_ROLES.staff)) {
        const adminActions =
          (SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>)[resource] ?? [];
        for (const action of actions ?? []) {
          expect(
            adminActions,
            `admin.${resource} should contain ${action} (staff has it)`,
          ).toContain(action);
        }
      }
    });

    it('owner and admin both contain staff:roleCreate (D-13 08.3 — renamed from role:create)', () => {
      expect(SYSTEM_ROLES.owner.staff ?? []).toContain('roleCreate');
      expect(SYSTEM_ROLES.admin.staff ?? []).toContain('roleCreate');
      expect(SYSTEM_ROLES.owner.staff ?? []).not.toContain('role:create');
      expect(SYSTEM_ROLES.admin.staff ?? []).not.toContain('role:create');
    });
  });

  describe('staff is read-only on tenant', () => {
    it('tenant: read only, no write actions', () => {
      expect(SYSTEM_ROLES.staff.tenant ?? []).toEqual(['read']);
    });

    it('does NOT have brand — the resource was dropped, not renamed, in the merge (D-40)', () => {
      const staff = SYSTEM_ROLES.staff as Record<string, readonly string[] | undefined>;
      expect(staff.brand).toBeUndefined();
    });

    it('does NOT have menu / order / staff / reports / settings / billing', () => {
      // staff is intentionally narrow — read tenant + brand only. Cast to
      // Record<string,...> for the same reason as the admin.billing test:
      // structural absence is a compile-time fact, runtime regression net
      // still needed.
      const staff = SYSTEM_ROLES.staff as Record<string, readonly string[] | undefined>;
      expect(staff.menu).toBeUndefined();
      expect(staff.order).toBeUndefined();
      expect(staff.staff).toBeUndefined();
      expect(staff.reports).toBeUndefined();
      expect(staff.settings).toBeUndefined();
      expect(staff.billing).toBeUndefined();
    });
  });

  describe('assertSystemRolesPresent — happy path', () => {
    it('passes silently when access-control.ts matches SYSTEM_ROLES', () => {
      // At the current commit, access-control.ts wires ownerRole / adminRole /
      // staffRole = ac.newRole(SYSTEM_ROLES.{owner,admin,staff}). No drift.
      expect(() => {
        assertSystemRolesPresent();
      }).not.toThrow();
    });
  });

  describe('SystemRoleDriftError shape', () => {
    it('exposes diff, expected, actual fields for forensic boot logs', () => {
      // Direct constructor test — we can't easily induce drift in the prod
      // module from a unit test (the access-control module is imported by
      // the assertion itself), but the error contract is part of the public
      // boot surface and worth pinning.
      const err = new SystemRoleDriftError(
        ['admin.tenant: expected ["read"], actual ["read","delete"]'],
        SYSTEM_ROLES,
        { admin: { tenant: ['read', 'delete'] } },
      );
      expect(err.name).toBe('SystemRoleDriftError');
      expect(err.diff).toHaveLength(1);
      expect(err.message).toContain('refusing to start');
      expect(err.message).toContain('packages/domain/src/rbac/system-roles.ts');
      expect(err.expected).toBe(SYSTEM_ROLES);
      expect(err.actual.admin?.tenant).toEqual(['read', 'delete']);
    });
  });
});
