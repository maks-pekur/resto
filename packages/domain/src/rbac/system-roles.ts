import type { Permission } from './permissions';

export const SYSTEM_ROLES = {
  owner: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status', 'cancel'],
    staff: ['invite', 'remove', 'roleCreate', 'roleUpdate'],
    reports: ['read'],
    settings: ['update'],
    billing: ['read', 'update'],
    tenant: ['read', 'delete', 'transfer'],
    // D-06 (08.4): owner has full location CRUD
    location: ['read', 'create', 'update', 'delete'],
    // D-17 (10.3): owner holds both table actions
    table: ['read', 'update'],
    // D-01/D-13 (08.3): owner-only; BA role-CRUD gate requires { ac: ['create'] }
    ac: ['create', 'read', 'update', 'delete'],
    invitation: ['create', 'cancel'],
  },
  admin: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status', 'cancel'],
    staff: ['invite', 'remove', 'roleCreate', 'roleUpdate'],
    reports: ['read'],
    settings: ['update'],
    tenant: ['read'],
    invitation: ['create', 'cancel'],
    // D-06 (08.4): admin is read-only on locations (planner default)
    location: ['read'],
    // D-17 (10.3): admin gets both table actions explicitly — not inferred from location
    table: ['read', 'update'],
  },
  staff: {
    tenant: ['read'],
    // D-06 (08.4): staff is read-only on locations
    location: ['read'],
  },
} as const satisfies Record<'owner' | 'admin' | 'staff', Permission>;

export type SystemRoleSlug = keyof typeof SYSTEM_ROLES;
