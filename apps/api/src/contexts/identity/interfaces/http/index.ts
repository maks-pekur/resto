/**
 * Public surface of the identity HTTP layer (RES-171).
 *
 * Cross-context callers (tenancy, catalog, health, …) import
 * decorators and principal types from here so they do not couple to
 * identity's internal file layout. New consumers MUST import from
 * `@/contexts/identity/interfaces/http` (this barrel) — never reach
 * into `decorators/*` or `../../domain/principal` directly.
 */
export {
  CurrentOperator,
  CurrentPrincipal,
  CurrentCustomer,
} from './decorators/current-principal.decorator';
export { Permissions } from './decorators/permissions.decorator';
export { Public } from './decorators/public.decorator';
export { RequireBrand } from './decorators/require-brand.decorator';
export type {
  Principal,
  OperatorPrincipal,
  CustomerPrincipal,
  AnonymousPrincipal,
} from '../../domain/principal';
