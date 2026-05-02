import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/auth.guard';

/**
 * Marks a route or controller as public — AuthGuard skips it.
 * Pair with InternalTokenGuard or other guards if the route still
 * needs auth.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
