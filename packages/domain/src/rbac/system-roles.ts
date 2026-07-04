import type { Permission } from './permissions';

export const SYSTEM_ROLES = {
  owner: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status'],
    staff: ['invite', 'remove', 'roleCreate', 'roleUpdate'],
    reports: ['read'],
    settings: ['update'],
    billing: ['read', 'update'],
    tenant: ['read', 'delete', 'transfer'],
    brand: ['read', 'create', 'update', 'delete'],
    // D-01/D-13 (08.3): owner-only; BA role-CRUD gate requires { ac: ['create'] }
    ac: ['create', 'read', 'update', 'delete'],
  },
  admin: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status'],
    staff: ['invite', 'remove', 'roleCreate', 'roleUpdate'],
    reports: ['read'],
    settings: ['update'],
    tenant: ['read'],
    brand: ['read', 'create', 'update', 'delete'],
  },
  staff: {
    tenant: ['read'],
    brand: ['read'],
  },
} as const satisfies Record<'owner' | 'admin' | 'staff', Permission>;

export type SystemRoleSlug = keyof typeof SYSTEM_ROLES;
