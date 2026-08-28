import { SetMetadata } from '@nestjs/common';

export const ALLOW_ARCHIVED_TENANT_KEY = 'tenancy:allow_archived_tenant';

/**
 * Exempts a route from `AuthGuard`'s blanket `archivedAt` refusal.
 *
 * `scheduleOffboarding` stamps `archivedAt`, which is what takes a tenant dark
 * during the cool-off. Without this exemption the cancel route is unreachable
 * the instant it becomes relevant, so the 30-day window cannot be used by the
 * person it exists for.
 *
 * Auth and permissions still apply — only the archived check is skipped.
 * Use for the narrow set of routes that must remain reachable *because* the
 * tenant is archived; never as a general escape hatch.
 */
export const AllowArchivedTenant = () => SetMetadata(ALLOW_ARCHIVED_TENANT_KEY, true);
