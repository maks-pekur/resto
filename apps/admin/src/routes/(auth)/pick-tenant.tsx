import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Route as authLayoutRoute } from './_layout';
import { apiFetch } from '@/lib/api-client';
import { meTenantsQuery } from '@/lib/queries/identity';
import { adminUrlForTenant } from '@/lib/admin-host';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SwitchTenantResponse {
  readonly organizationId: string;
  readonly slug: string;
}

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/pick-tenant',
  component: PickTenantPage,
});

function PickTenantPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'pickTenant' });
  const { data: tenantsResult, isPending } = useQuery(meTenantsQuery());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tenants = tenantsResult?.data?.tenants ?? [];

  const pick = async (tenantId: string) => {
    setPendingId(tenantId);
    setError(null);
    // D-15/D-16/D-21: revoke-and-reissue, then a HARD navigation — the
    // tenant lives in the host, and a client-side route push cannot
    // cross origins.
    const res = await apiFetch<SwitchTenantResponse>('/api/auth/switch-organization', {
      method: 'POST',
      body: { organizationId: tenantId },
    });
    if (!res.ok || !res.data) {
      setError(t('error'));
      setPendingId(null);
      return;
    }
    window.location.assign(adminUrlForTenant(res.data.slug, '/dashboard'));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {isPending ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : tenants.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
            <p className="text-muted-foreground text-sm">{t('emptyDescription')}</p>
          </>
        ) : (
          tenants.map((tenant) => (
            <Button
              key={tenant.id}
              variant="outline"
              className="justify-start"
              disabled={pendingId !== null}
              onClick={() => void pick(tenant.id)}
            >
              {pendingId === tenant.id
                ? t('enteringState', { name: tenant.displayName })
                : tenant.displayName}
            </Button>
          ))
        )}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
