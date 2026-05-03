/**
 * Source of truth for RBAC permissions in Resto. To add a permission:
 *   1. Add the slug here.
 *   2. Update `system-roles.ts` to grant it as appropriate.
 *   3. Run `pnpm db:rbac:sync` (added in Phase E) to seed BA.
 *
 * Tenant-defined custom roles do NOT auto-receive new permissions —
 * tenants opt in per-role via admin UI (Phase B/C).
 */
export const PERMISSIONS_STATEMENT = {
  menu: ['read', 'create', 'update', 'delete'],
  order: ['read', 'update-status'],
  staff: ['invite', 'remove', 'role:create', 'role:update'],
  reports: ['read'],
  settings: ['update'],
  billing: ['read', 'update'],
  tenant: ['read', 'delete', 'transfer'],
} as const;

export type PermissionResource = keyof typeof PERMISSIONS_STATEMENT;

export type Permission = {
  [K in PermissionResource]?: readonly (typeof PERMISSIONS_STATEMENT)[K][number][];
};
