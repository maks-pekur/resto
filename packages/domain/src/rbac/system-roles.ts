import type { Permission } from './permissions';

/**
 * Static permission sets for the three system roles. Consumed at api-boot
 * to construct Better Auth's accessControl statements.
 *
 * Tenant-creatable roles are dynamic and live in BA's `organization_role`
 * table at runtime — NOT defined here.
 */
export const SYSTEM_ROLES = {
  owner: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status'],
    staff: ['invite', 'remove', 'role:create', 'role:update'],
    reports: ['read'],
    settings: ['update'],
    billing: ['read', 'update'],
    tenant: ['read', 'delete', 'transfer'],
  },
  admin: {
    menu: ['read', 'create', 'update', 'delete'],
    order: ['read', 'update-status'],
    staff: ['invite', 'remove', 'role:create', 'role:update'],
    reports: ['read'],
    settings: ['update'],
    tenant: ['read'],
  },
  staff: {
    tenant: ['read'],
  },
} as const satisfies Record<'owner' | 'admin' | 'staff', Permission>;

export type SystemRoleSlug = keyof typeof SYSTEM_ROLES;
