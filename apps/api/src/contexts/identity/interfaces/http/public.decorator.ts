import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by `AuthGuard` to bypass authentication on routes
 * that are intentionally public (health endpoints, OpenAPI docs).
 */
export const IS_PUBLIC_KEY = 'identity:isPublic';

/**
 * Mark a controller or handler as public. The global AuthGuard skips
 * the bearer-token check for these routes.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
