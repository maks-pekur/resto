/**
 * Operator-side roles a user can hold inside a tenant. Customer-facing
 * roles (loyalty, ordering) are not modelled here yet — they land with
 * the customer slice. Mirrors `users.role` in `@resto/db` and the
 * `UserRole` enum in `@resto/domain` (single source of truth lives in
 * the domain package; this file re-exports for ergonomics inside the
 * api layer).
 */
import { UserRole } from '@resto/domain';

export type Role = (typeof UserRole.options)[number];

export const ROLE_VALUES: readonly Role[] = UserRole.options;

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (UserRole.options as readonly string[]).includes(value);
