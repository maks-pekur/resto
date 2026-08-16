import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getBrandPaymentStatus } from '@/lib/brand-payments-api';
import { itemsQuery } from '@/lib/queries/catalog';
import { brandLocationsQuery } from '@/lib/queries/locations';
import { tenantDomainsQuery } from '@/lib/queries/tenancy';
import { showSuccess } from '@/lib/ui/toast-helpers';

export interface OrdersEmptyStateProps {
  readonly brandSlug: string;
}

export function OrdersEmptyState({ brandSlug }: OrdersEmptyStateProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.empty' });

  const paymentsQuery = useQuery({
    queryKey: ['brand-payment-status', brandSlug] as const,
    queryFn: () => getBrandPaymentStatus(brandSlug),
  });
  const menuQuery = useQuery(itemsQuery(brandSlug, { status: 'published', limit: 1 }));
  const locationsQuery = useQuery(brandLocationsQuery(brandSlug));
  const domainsQuery = useQuery(tenantDomainsQuery());

  const paymentsConnected = paymentsQuery.data?.data?.canAcceptPayments ?? false;
  const menuPublished = (menuQuery.data?.data?.total ?? 0) > 0;
  const locations = locationsQuery.data?.data ?? [];
  const locationOpen = locations.some((location) => location.status === 'active');

  const domains = domainsQuery.data?.data ?? [];
  const primaryDomain = domains.find((domain) => domain.isPrimary) ?? domains[0];
  const orderingLink = primaryDomain ? `https://${primaryDomain.domain}` : null;

  const checklist: readonly { readonly key: string; readonly done: boolean }[] = [
    { key: 'checklistPayments', done: paymentsConnected },
    { key: 'checklistMenu', done: menuPublished },
    { key: 'checklistLocation', done: locationOpen },
  ];

  const copyLink = () => {
    if (!orderingLink) return;
    void navigator.clipboard.writeText(orderingLink).then(() => {
      showSuccess(t('linkCopiedToast'));
    });
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{t('activationTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('activationBody')}</p>
        <ul className="flex flex-col gap-1.5">
          {checklist.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2 text-sm">
              {entry.done ? (
                <Check className="size-4 text-success" />
              ) : (
                <X className="size-4 text-muted-foreground" />
              )}
              {t(entry.key)}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            className="w-fit gap-1.5"
            onClick={copyLink}
            disabled={!orderingLink}
          >
            <Copy className="size-4" />
            {t('copyLinkBtn')}
          </Button>
          {!orderingLink ? (
            <p className="text-xs text-muted-foreground">{t('noDomainHint')}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
