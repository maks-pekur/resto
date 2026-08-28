import type { QueryClient } from '@tanstack/react-query';
import type { PERMISSIONS_STATEMENT, PermissionResource } from '@resto/domain';
import { meQuery, type MeResponse } from '@/lib/queries/identity';

type ActionOf<R extends PermissionResource> = (typeof PERMISSIONS_STATEMENT)[R][number];

export interface RequiredPermission {
  readonly resource: PermissionResource;
  readonly action: string;
}

export class ForbiddenRouteError extends Error {
  readonly required: RequiredPermission;

  constructor(required: RequiredPermission) {
    super(`Forbidden: ${required.resource}:${required.action}`);
    this.name = 'ForbiddenRouteError';
    this.required = required;
  }
}

export const isForbiddenRouteError = (err: unknown): err is ForbiddenRouteError =>
  err instanceof Error && err.name === 'ForbiddenRouteError';

/**
 * The one client-side reading of `/v1/me`.permissions. The sidebar decides what to offer with it
 * and every gated route refuses with it, so a hidden door and a locked door can never disagree.
 */
export const hasPermission = <R extends PermissionResource>(
  me: MeResponse | null | undefined,
  resource: R,
  action: ActionOf<R>,
): boolean => {
  if (!me) return false;
  if (me.baseRole === 'owner') return true;
  return me.permissions?.[resource]?.includes(action) ?? false;
};

export interface PermissionGuard {
  (opts: { readonly context: { readonly queryClient: QueryClient } }): Promise<void>;
  readonly permission: RequiredPermission;
}

/**
 * Route-level refusal. Hiding a nav item is convenience; this is what makes a typed URL or a stale
 * bookmark stop at the door instead of rendering a screen whose every request will 403.
 */
export const requirePermission = <R extends PermissionResource>(
  resource: R,
  action: ActionOf<R>,
): PermissionGuard => {
  const guard = async ({
    context,
  }: {
    readonly context: { readonly queryClient: QueryClient };
  }): Promise<void> => {
    const me = await context.queryClient.ensureQueryData(meQuery());
    if (!hasPermission(me.data, resource, action)) {
      throw new ForbiddenRouteError({ resource, action });
    }
  };

  return Object.assign(guard, { permission: { resource, action } });
};
