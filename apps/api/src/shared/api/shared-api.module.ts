import { Global, Module } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';

/**
 * Cross-cutting HTTP-layer providers (RES-171). Marked `@Global()` so
 * any feature module can `@UseGuards(InternalTokenGuard)` without
 * importing this module explicitly. Currently exposes the
 * `InternalTokenGuard` (used by tenancy, identity and catalog `internal`
 * controllers); future shared HTTP helpers belong here too.
 */
@Global()
@Module({
  providers: [InternalTokenGuard],
  exports: [InternalTokenGuard],
})
export class SharedApiModule {}
