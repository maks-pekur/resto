import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../domain/role';

/**
 * Metadata key the RolesGuard reads to decide whether the current
 * principal's roles intersect with the route's allowed set.
 */
export const ROLES_KEY = 'identity:roles';

/**
 * Restrict a route to principals carrying ANY of the listed roles.
 * Empty list = no role check (the AuthGuard's authentication is enough).
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
