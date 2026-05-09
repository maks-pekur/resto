import { PERMISSIONS_STATEMENT, SYSTEM_ROLES } from '@resto/domain';
import { createAccessControl } from 'better-auth/plugins/access';

export const ac = createAccessControl(PERMISSIONS_STATEMENT);

export const ownerRole = ac.newRole(SYSTEM_ROLES.owner);
export const adminRole = ac.newRole(SYSTEM_ROLES.admin);
export const staffRole = ac.newRole(SYSTEM_ROLES.staff);
