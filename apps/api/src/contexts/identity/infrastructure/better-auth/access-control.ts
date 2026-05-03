import { PERMISSIONS_STATEMENT, SYSTEM_ROLES } from '@resto/domain';
import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Better Auth access control. The statement matches `PERMISSIONS_STATEMENT`
 * from `@resto/domain` exactly — single source of truth.
 *
 * BA's `newRole` signature uses a precise `Subset<...>` of the statement
 * literal that requires mutable arrays. Our domain catalogue is `as const`
 * (readonly), which keeps `@resto/domain` framework-agnostic and useful in
 * `apps/admin` / `apps/mobile`. Cast at this boundary — runtime shape is
 * identical, only TS variance differs. `as never` chosen over `as any` so
 * any future BA signature change surfaces here as a typecheck failure.
 */
type NewRoleInput = Parameters<typeof ac.newRole>[0];

export const ac = createAccessControl(PERMISSIONS_STATEMENT);

export const ownerRole = ac.newRole(SYSTEM_ROLES.owner as unknown as NewRoleInput);
export const adminRole = ac.newRole(SYSTEM_ROLES.admin as unknown as NewRoleInput);
export const staffRole = ac.newRole(SYSTEM_ROLES.staff as unknown as NewRoleInput);
