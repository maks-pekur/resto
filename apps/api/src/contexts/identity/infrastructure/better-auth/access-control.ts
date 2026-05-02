import { createAccessControl } from 'better-auth/plugins/access';
import { PERMISSIONS_STATEMENT, SYSTEM_ROLES } from '@resto/domain';

/**
 * Better Auth access control. The statement matches `PERMISSIONS_STATEMENT`
 * from `@resto/domain` exactly — single source of truth.
 */
export const ac = createAccessControl(PERMISSIONS_STATEMENT);

export const ownerRole = ac.newRole(SYSTEM_ROLES.owner);
export const adminRole = ac.newRole(SYSTEM_ROLES.admin);
export const staffRole = ac.newRole(SYSTEM_ROLES.staff);
