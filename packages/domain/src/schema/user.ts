import { z } from 'zod';
import { TenantId, UserId } from '../ids';
import { timestampsShape } from './_shared';

/**
 * Role of an operator-side user inside a tenant. Customer-facing roles
 * (loyalty, ordering) are not modelled here yet — they land with the
 * customer/identity slice.
 */
export const UserRole = z.enum(['owner', 'manager', 'kitchen', 'waiter']);
export type UserRole = z.infer<typeof UserRole>;

/**
 * Per-tenant projection of a Keycloak human user. The same Keycloak
 * subject can be a user in more than one tenant with potentially
 * different roles, modelled by separate rows. Mirrors the `users` table
 * in `@resto/db`.
 */
export const User = z.object({
  id: UserId,
  tenantId: TenantId,
  keycloakSubject: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).nullable(),
  role: UserRole,
  ...timestampsShape,
});
export type User = z.infer<typeof User>;
