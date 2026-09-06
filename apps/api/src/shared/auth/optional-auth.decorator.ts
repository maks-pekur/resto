import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_AUTH_KEY = 'identity:optional-auth';

/**
 * Pairs with `@Public()`: the route stays open to anonymous callers, but a request that carries a
 * valid session gets a real principal instead of an anonymous one. Never refuses — an expired or
 * invalid session yields `anonymous`, because a guest whose cookie lapsed must still place an order.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
