/**
 * Identity context discriminated union for the authenticated subject of
 * a request. AuthGuard (Phase B) resolves and attaches one of these to
 * `req.principal`; controllers consume via @CurrentPrincipal decorators.
 *
 * `tenantId` is optional on OperatorPrincipal because a freshly email-
 * signed-up user has no organization membership yet — that case is
 * exercised by Phase A's smoke test and remains valid here.
 */
export interface OperatorPrincipal {
  kind: 'operator';
  userId: string;
  email: string;
  tenantId?: string;
  baseRole?: 'owner' | 'admin' | 'staff';
}

export interface CustomerPrincipal {
  kind: 'customer';
  userId: string;
  phone: string;
  tenantId: string;
  /** Populated in Phase E by the BA verify hook; undefined in Phase B. */
  customerProfileId?: string;
}

export interface AnonymousPrincipal {
  kind: 'anonymous';
}

export type Principal = OperatorPrincipal | CustomerPrincipal | AnonymousPrincipal;
