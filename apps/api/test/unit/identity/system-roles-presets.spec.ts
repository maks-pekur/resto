import { describe, expect, it } from 'vitest';
import { SYSTEM_ROLES } from '@resto/domain';
import {
  assertSystemRolesPresent,
  SystemRoleDriftError,
} from '../../../src/bootstrap/assert-system-roles-present';

/**
 * AUTH-09 / D-16 (Phase 3 / Plan 05) regression net.
 *
 * REINTERPRETED per plan-checker B-4 2026-05-30: the BA `organization_role`
 * table is DYNAMIC tenant-creatable role storage; static presets live in
 * `apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts`.
 * This spec pins:
 *
 * 1. owner ⊇ admin ⊇ staff at the resource/action level (containment).
 * 2. admin DOES NOT contain dangerous permissions reserved for owner
 *    (`tenant:delete`, `tenant:transfer`, `staff:role:create`).
 * 3. staff is read-only on tenant/brand (no create / update / delete).
 * 4. `assertSystemRolesPresent` passes silently when access-control.ts
 *    matches SYSTEM_ROLES (i.e. at the current commit, with no drift).
 *
 * Drift simulation tests live next to this one (see test 5 onward).
 */
describe('AUTH-09 D-16: SYSTEM_ROLES regression', () => {
  describe('admin denied permissions (packages/domain CLAUDE.md mandate)', () => {
    it('does NOT contain tenant:delete', () => {
      expect(SYSTEM_ROLES.admin.tenant ?? []).not.toContain('delete');
    });

    it('does NOT contain tenant:transfer', () => {
      expect(SYSTEM_ROLES.admin.tenant ?? []).not.toContain('transfer');
    });

    it('does NOT receive billing:update (owner-only)', () => {
      // billing entirely owner-scope: admin should not even have `read`
      // until a future plan explicitly grants it (skeptic guardrail). The
      // `as Record<...>` cast is necessary because SYSTEM_ROLES is `satisfies`
      // a narrowed type per slug — TS knows admin.billing is structurally
      // absent at compile time, but we still want a runtime regression net.
      const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
      expect(admin.billing).toBeUndefined();
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

    it('owner additionally contains staff:role:create (admin keeps it too — Phase 17 TEAM-03)', () => {
      // staff:role:create stays in admin per current SYSTEM_ROLES design;
      // pin both shapes so a future change to remove it from admin is a
      // deliberate decision, not a silent regression.
      expect(SYSTEM_ROLES.owner.staff ?? []).toContain('role:create');
      expect(SYSTEM_ROLES.admin.staff ?? []).toContain('role:create');
    });
  });

  describe('staff is read-only on tenant/brand', () => {
    it('tenant: read only, no write actions', () => {
      expect(SYSTEM_ROLES.staff.tenant ?? []).toEqual(['read']);
    });

    it('brand: read only, no write actions', () => {
      expect(SYSTEM_ROLES.staff.brand ?? []).toEqual(['read']);
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
