import { describe, expect, it } from 'vitest';
import { NON_DELEGATABLE, PRESET_ROLES, SYSTEM_ROLES } from '../../src/rbac';

describe('system-roles admin-escalation regression (D-06/D-07, 08.4)', () => {
  it('admin has no ac permission', () => {
    const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
    expect(admin.ac).toBeUndefined();
  });

  it('admin holds none of the NON_DELEGATABLE tenant/billing/ac actions', () => {
    // NON_DELEGATABLE.staff (['remove']) is deliberately excluded here: admin legitimately
    // holds staff:remove as a pre-existing 08.3 system-role grant (packages/domain/CLAUDE.md's
    // own canonical "must NOT receive" example lists only tenant:delete/tenant:transfer — not
    // staff:remove). NON_DELEGATABLE governs what is delegatable to CUSTOM roles, not what the
    // hardcoded admin system role may hold. This test pins the escalation surface relevant to
    // D-06/D-07 (the new location resource + the ac gate), not that unrelated invariant.
    const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
    const scoped = [
      'tenant',
      'billing',
      'ac',
    ] as const satisfies readonly (keyof typeof NON_DELEGATABLE)[];
    for (const resource of scoped) {
      const actions = NON_DELEGATABLE[resource] ?? [];
      const adminActions = admin[resource] ?? [];
      for (const action of actions) {
        expect(
          adminActions,
          `admin must NOT hold NON_DELEGATABLE action ${resource}:${action}`,
        ).not.toContain(action);
      }
    }
  });

  it('staff.location is read-only — no create/update/delete', () => {
    expect(SYSTEM_ROLES.staff.location).toEqual(['read']);
    expect(SYSTEM_ROLES.staff.location).not.toContain('create');
    expect(SYSTEM_ROLES.staff.location).not.toContain('update');
    expect(SYSTEM_ROLES.staff.location).not.toContain('delete');
  });

  it('admin.location is read-only — no create/update/delete (owner-only location writes)', () => {
    expect(SYSTEM_ROLES.admin.location).toEqual(['read']);
    expect(SYSTEM_ROLES.admin.location).not.toContain('create');
    expect(SYSTEM_ROLES.admin.location).not.toContain('update');
    expect(SYSTEM_ROLES.admin.location).not.toContain('delete');
  });

  it('only owner carries ac — the sole owner-only assignment gate (D-15)', () => {
    const roles = SYSTEM_ROLES as unknown as Record<string, Record<string, unknown>>;
    for (const [slug, role] of Object.entries(roles)) {
      if (slug === 'owner') {
        expect(role.ac).toBeDefined();
      } else {
        expect(role.ac, `${slug} must NOT hold ac`).toBeUndefined();
      }
    }
  });

  it('owner and admin both hold table:[read, update] (D-17, 10.3)', () => {
    expect(SYSTEM_ROLES.owner.table).toEqual(['read', 'update']);
    expect(SYSTEM_ROLES.admin.table).toEqual(['read', 'update']);
  });

  it('staff.table is undefined — staff is not named as a table:read grantee (D-17, 10.3)', () => {
    const staff = SYSTEM_ROLES.staff as Record<string, readonly string[] | undefined>;
    expect(staff.table).toBeUndefined();
  });

  it('admin.location still equals [read] — the table split did not widen location (D-17, 10.3)', () => {
    expect(SYSTEM_ROLES.admin.location).toEqual(['read']);
  });

  it("the manager preset's table equals [read] and does not contain update (D-17, 10.3)", () => {
    const manager = PRESET_ROLES.find((preset) => preset.slug === 'manager');
    expect(manager?.permission.table).toEqual(['read']);
    expect(manager?.permission.table).not.toContain('update');
  });
});
