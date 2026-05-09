'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';

interface MeResponse {
  kind: 'operator' | 'customer' | 'anonymous';
  userId?: string;
  email?: string;
  tenantId?: string;
  baseRole?: 'owner' | 'admin' | 'staff';
}

interface TenantResponse {
  id: string;
  status: string;
  offboardingScheduledAt: string | null;
  offboardingExecutedAt: string | null;
  offboardingRequestedBy: string | null;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

const friendlyError = (status: number, body: ProblemDetails | null): string => {
  if (status === 404) return 'Tenant not found.';
  if (status === 401) return 'Not authorized.';
  if (status === 409) {
    if (body?.detail?.includes('cool-off'))
      return 'Cool-off has expired; cancellation is no longer possible.';
    if (body?.detail?.includes('cannot be offboarded'))
      return 'Tenant is not in a state that allows this action.';
    return body?.detail ?? 'Conflict.';
  }
  return body?.detail ?? `Request failed (${status.toString()}).`;
};

const requireOwner = async (): Promise<
  { tenantId: string; userId: string } | { error: string }
> => {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator') return { error: 'Not signed in as an operator.' };
  if (me.data.baseRole !== 'owner') return { error: 'Owner role required.' };
  if (!me.data.tenantId || !me.data.userId) return { error: 'No active tenant.' };
  return { tenantId: me.data.tenantId, userId: me.data.userId };
};

export const scheduleOffboardingAction = async (): Promise<ActionResult> => {
  const auth = await requireOwner();
  if ('error' in auth) return { ok: false, message: auth.error };

  const res = await apiFetchInternal<TenantResponse | ProblemDetails>(
    `/internal/v1/tenants/${auth.tenantId}/offboard`,
    { method: 'POST', body: { requestedBy: auth.userId } },
  );

  if (!res.ok) {
    return { ok: false, message: friendlyError(res.status, res.data as ProblemDetails | null) };
  }
  revalidatePath('/dashboard/settings');
  return { ok: true, message: 'Offboarding scheduled. Cool-off ends in 30 days.' };
};

export const cancelOffboardingAction = async (): Promise<ActionResult> => {
  const auth = await requireOwner();
  if ('error' in auth) return { ok: false, message: auth.error };

  const res = await apiFetchInternal<TenantResponse | ProblemDetails>(
    `/internal/v1/tenants/${auth.tenantId}/offboard`,
    { method: 'DELETE' },
  );

  if (!res.ok) {
    return { ok: false, message: friendlyError(res.status, res.data as ProblemDetails | null) };
  }
  revalidatePath('/dashboard/settings');
  return { ok: true, message: 'Offboarding cancelled. Tenant is active again.' };
};
