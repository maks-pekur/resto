import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS_STATEMENT,
  SYSTEM_ROLES,
  type Permission,
  NON_DELEGATABLE,
  containsNonDelegatable,
} from '../src/rbac';

describe('RBAC permission catalogue', () => {
  it('exposes the expected resources including ac, location and invitation', () => {
    expect(Object.keys(PERMISSIONS_STATEMENT).sort()).toEqual(
      [
        'ac',
        'billing',
        'invitation',
        'location',
        'menu',
        'order',
        'reports',
        'settings',
        'staff',
        'tenant',
      ].sort(),
    );
  });

  it('location resource has read/create/update/delete actions with no colon', () => {
    expect(PERMISSIONS_STATEMENT.location).toEqual(['read', 'create', 'update', 'delete']);
  });

  it('ac resource has create/read/update/delete actions', () => {
    expect(PERMISSIONS_STATEMENT.ac).toEqual(['create', 'read', 'update', 'delete']);
  });

  it('no action name contains a colon character', () => {
    const allActions = Object.values(PERMISSIONS_STATEMENT).flat();
    for (const action of allActions) {
      expect(action, `action "${action}" must not contain ":"`).not.toContain(':');
    }
  });

  it('staff actions use camelCase (roleCreate, roleUpdate — not colon form)', () => {
    expect(PERMISSIONS_STATEMENT.staff).toContain('roleCreate');
    expect(PERMISSIONS_STATEMENT.staff).toContain('roleUpdate');
    expect(PERMISSIONS_STATEMENT.staff).not.toContain('role:create');
    expect(PERMISSIONS_STATEMENT.staff).not.toContain('role:update');
  });

  it('owner has every permission in the statement', () => {
    for (const [resource, actions] of Object.entries(PERMISSIONS_STATEMENT)) {
      const owner = SYSTEM_ROLES.owner[resource as keyof typeof PERMISSIONS_STATEMENT];
      for (const action of actions) {
        expect(owner, `owner missing ${resource}:${action}`).toContain(action);
      }
    }
  });

  it('owner has ac resource', () => {
    const owner = SYSTEM_ROLES.owner as Record<string, readonly string[] | undefined>;
    expect(owner.ac).toEqual(['create', 'read', 'update', 'delete']);
  });

  it('admin does NOT have ac resource', () => {
    const admin = SYSTEM_ROLES.admin as Record<string, readonly string[] | undefined>;
    expect(admin.ac).toBeUndefined();
  });

  it('admin lacks billing but reads its own tenant', () => {
    expect(SYSTEM_ROLES.admin).not.toHaveProperty('billing');
    expect(SYSTEM_ROLES.admin.tenant).toEqual(['read']);
  });

  it('admin has menu update', () => {
    expect(SYSTEM_ROLES.admin.menu).toContain('update');
  });

  it('staff can only read tenant + location', () => {
    expect(Object.keys(SYSTEM_ROLES.staff).sort()).toEqual(['location', 'tenant']);
    expect(SYSTEM_ROLES.staff.tenant).toEqual(['read']);
    expect(SYSTEM_ROLES.staff.location).toEqual(['read']);
  });

  it('owner has full location permissions', () => {
    expect(SYSTEM_ROLES.owner.location).toEqual(['read', 'create', 'update', 'delete']);
  });

  it('admin can only read locations', () => {
    expect(SYSTEM_ROLES.admin.location).toEqual(['read']);
  });

  it('Permission type is well-typed', () => {
    const p: Permission = { menu: ['update'] };
    expect(p.menu).toEqual(['update']);
  });
});

describe('NON_DELEGATABLE allowlist', () => {
  it('exports NON_DELEGATABLE constant with expected entries', () => {
    const nd = NON_DELEGATABLE as Record<string, readonly string[]>;
    expect(nd.tenant).toContain('delete');
    expect(nd.tenant).toContain('transfer');
    expect(nd.billing).toContain('update');
    expect(nd.staff).toContain('remove');
    expect(nd.ac).toContain('create');
    expect(nd.ac).toContain('read');
    expect(nd.ac).toContain('update');
    expect(nd.ac).toContain('delete');
  });

  it('containsNonDelegatable({ ac: ["create"] }) === true', () => {
    expect(containsNonDelegatable({ ac: ['create'] })).toBe(true);
  });

  it('containsNonDelegatable({ tenant: ["delete"] }) === true', () => {
    expect(containsNonDelegatable({ tenant: ['delete'] })).toBe(true);
  });

  it('containsNonDelegatable({ billing: ["update"] }) === true', () => {
    expect(containsNonDelegatable({ billing: ['update'] })).toBe(true);
  });

  it('containsNonDelegatable({ staff: ["remove"] }) === true', () => {
    expect(containsNonDelegatable({ staff: ['remove'] })).toBe(true);
  });

  it('containsNonDelegatable({ menu: ["read","update"] }) === false', () => {
    expect(containsNonDelegatable({ menu: ['read', 'update'] })).toBe(false);
  });

  it('containsNonDelegatable({ staff: ["invite"] }) === false (invite is not non-delegatable)', () => {
    expect(containsNonDelegatable({ staff: ['invite'] })).toBe(false);
  });

  it('containsNonDelegatable({}) === false', () => {
    expect(containsNonDelegatable({})).toBe(false);
  });

  it('containsNonDelegatable({ tenant: ["read"] }) === false', () => {
    expect(containsNonDelegatable({ tenant: ['read'] })).toBe(false);
  });
});
