export const PERMISSIONS_STATEMENT = {
  menu: ['read', 'create', 'update', 'delete'],
  order: ['read', 'update-status', 'cancel'],
  staff: ['invite', 'remove', 'roleCreate', 'roleUpdate'],
  reports: ['read'],
  settings: ['update'],
  billing: ['read', 'update'],
  tenant: ['read', 'delete', 'transfer'],
  // D-06 (08.4): location resource — owner-only write, admin/staff read (system-roles.ts)
  location: ['read', 'create', 'update', 'delete'],
  // D-13 (08.3): BA dynamicAccessControl gate checks { ac: ['create'] }; no ':' in action names
  ac: ['create', 'read', 'update', 'delete'],
  // Replaces BA's organization defaultStatements: omitting this denies invites to every role.
  invitation: ['create', 'cancel'],
} as const;

export type PermissionResource = keyof typeof PERMISSIONS_STATEMENT;

export type Permission = {
  [K in PermissionResource]?: readonly (typeof PERMISSIONS_STATEMENT)[K][number][];
};
