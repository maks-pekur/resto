import { z } from 'zod';
import { RESERVED_SLUGS, RESERVED_SLUG_SET } from './reserved-slugs';

export const TENANT_RESERVED_SLUGS = RESERVED_SLUGS;

/**
 * Tenant slug. Stricter than the generic `Slug`:
 *
 * - 3..64 characters (matches the db `tenants_slug_format_chk`)
 * - starts and ends with an alphanumeric character (no edge hyphens)
 * - lowercase ASCII letters, digits, and hyphens only
 * - not a reserved platform name (see `RESERVED_SLUGS`)
 * - not a punycode/IDN label (xn-- prefix; RFC 3490 homograph defence)
 *
 * The reserved-list check is enforced here rather than at the database
 * because it is policy, not a structural invariant — the list will grow
 * and shrink without migrations.
 */
const tenantSlugRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/**
 * HTTP-boundary form — use this in every `createZodDto` request schema
 * (signup, onboarding, slug-availability checks); `nestjs-zod` emits
 * `type: string` for it.
 *
 * WHY unbranded, deliberately deviating from the `FooValue`/branded-`Foo`
 * pair convention (`packages/domain/CLAUDE.md`): `TenantSlug` is unbranded
 * today and referenced by 32 files outside this package. Branding it would
 * ripple that churn for zero contract gain, because the `type: unknown`
 * OpenAPI bug (ADR-0020 I-7) only occurs with a *branded* schema.
 * `TenantSlugValue` is the name HTTP DTOs must use from now on;
 * `TenantSlug` stays as the unbranded alias every existing call site uses.
 */
export const TenantSlugValue = z
  .string()
  .regex(tenantSlugRegex, 'must be 3..64 lowercase alphanumeric/hyphen chars without edge hyphens')
  // Reserved-list check is case-insensitive: the regex guarantees lowercase input
  // in normal use, but a request that bypasses the regex (e.g. internal callers
  // constructing a TenantSlugValue from a header) still gets rejected on `Admin` /
  // `ADMIN` etc. Defence in depth, per packages/domain/CLAUDE.md.
  .refine((v) => !RESERVED_SLUG_SET.has(v.toLowerCase()), 'is a reserved platform slug')
  .refine((v) => !v.startsWith('xn--'), 'must not be a punycode/IDN (xn--) label');
export type TenantSlugValue = z.infer<typeof TenantSlugValue>;

export const TenantSlug = TenantSlugValue;
export type TenantSlug = z.infer<typeof TenantSlugValue>;
