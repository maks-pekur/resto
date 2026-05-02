import { describe, expect, it } from 'vitest';
import { PERMISSIONS_STATEMENT, SYSTEM_ROLES, type Permission } from '../src/rbac';

describe('RBAC permission catalogue', () => {
  it('exposes the expected resources', () => {
    expect(Object.keys(PERMISSIONS_STATEMENT).sort()).toEqual(
      ['billing', 'menu', 'order', 'reports', 'settings', 'staff', 'tenant'].sort(),
    );
  });

  it('owner has every permission in the statement', () => {
    for (const [resource, actions] of Object.entries(PERMISSIONS_STATEMENT)) {
      const owner = SYSTEM_ROLES.owner[resource as keyof typeof PERMISSIONS_STATEMENT] ?? [];
      for (const action of actions) {
        expect(owner, `owner missing ${resource}:${action}`).toContain(action);
      }
    }
  });

  it('admin lacks billing and tenant permissions', () => {
    expect(SYSTEM_ROLES.admin).not.toHaveProperty('billing');
    expect(SYSTEM_ROLES.admin).not.toHaveProperty('tenant');
  });

  it('admin has menu update', () => {
    expect(SYSTEM_ROLES.admin.menu).toContain('update');
  });

  it('staff has no permissions by default', () => {
    expect(Object.keys(SYSTEM_ROLES.staff)).toHaveLength(0);
  });

  it('Permission type is well-typed', () => {
    const p: Permission = { menu: ['update'] };
    expect(p.menu).toEqual(['update']);
  });
});
