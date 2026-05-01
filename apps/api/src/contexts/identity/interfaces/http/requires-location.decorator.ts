import { SetMetadata } from '@nestjs/common';

export const REQUIRES_LOCATION_KEY = 'identity:requiresLocation';

/**
 * ABAC primitive — restrict a route to principals scoped to the named
 * location parameter (e.g. `:locationId` from the path). The
 * `RolesGuard` enforces this in addition to the role check; the actual
 * location-id resolution is wired in MVP-2 when multi-location support
 * lands. For MVP-1 the rule validates against the tenant's single
 * location.
 */
export const RequiresLocation = (paramName: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_LOCATION_KEY, paramName);
