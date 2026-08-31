import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Settings2,
  Receipt,
  Table2,
  Users,
  UtensilsCrossed,
  Ban,
} from 'lucide-react';
import { TenantIdentity } from '@/components/layout/tenant-identity';
import { NavMain, type NavMainItem } from '@/components/layout/nav-main';
import { meQuery } from '@/lib/queries/identity';
import { meLocationsQuery } from '@/lib/queries/locations';
import { sortLocations } from '@/lib/default-location';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { hasPermission } from '@/lib/auth/permissions';
import { DEFAULT_ORDER_FEED_FILTERS, ordersFeedQuery } from '@/lib/queries/orders';
import { transactionAlertsQuery } from '@/lib/queries/transactions';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export function AppSidebar({ variant = 'inset', collapsible = 'icon', ...props }: AppSidebarProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'nav' });
  const { t: tOrders } = useTranslation('translation', { keyPrefix: 'orders' });
  const { t: tTransactions } = useTranslation('translation', { keyPrefix: 'transactions' });

  // Hiding is convenience, not security — every route refuses a direct link with the same
  // `hasPermission` call (see lib/auth/permissions). This only stops an operator being offered a
  // door that will not open for them.
  const { data: meResult } = useQuery(meQuery());
  const me = meResult?.data ?? null;
  const { data: locationsResult } = useQuery(meLocationsQuery());
  const locations = sortLocations(locationsResult?.data?.locations ?? []);

  const { mode, locationId: effectiveLocationId, locationSlug } = useEffectiveLocation();

  // Location-grain pages need a slug in their address. On the every-location dashboard there is no
  // current one, so the links point at the default — the same place a slugless URL would land.
  const navLocationSlug = locationSlug ?? locations[0]?.slug;

  // The feed is single-location, so an every-location badge would be counting nothing. Better no
  // number than one whose scope does not match the page the operator is looking at.
  const { data: unacceptedFeedResult } = useQuery({
    ...ordersFeedQuery(effectiveLocationId ?? 'all', DEFAULT_ORDER_FEED_FILTERS),
    enabled: mode === 'single' && effectiveLocationId !== undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const unacceptedCount = (unacceptedFeedResult?.data?.rows ?? []).filter(
    (row) => row.status === 'paid' && row.acceptedAt === null,
  ).length;

  // Tenant-wide and date-less: a refund that failed yesterday is still money owed today, so the
  // badge must not depend on which day or point the operator happens to be looking at.
  const { data: transactionAlerts } = useQuery({
    ...transactionAlertsQuery(),
    enabled: hasPermission(me, 'billing', 'read'),
    refetchInterval: 60_000,
  });
  const refundFailedCount = transactionAlerts?.data?.refundFailed ?? 0;

  const navOperations: NavMainItem[] = [
    { title: t('dashboard'), url: '/dashboard', icon: LayoutDashboard },
    ...(hasPermission(me, 'order', 'read') && navLocationSlug !== undefined
      ? [
          {
            title: t('orders'),
            url: `/${navLocationSlug}/orders`,
            icon: ClipboardList,
            badge: unacceptedCount,
            badgeAriaLabel: tOrders('card.sidebarBadgeAria', { count: unacceptedCount }),
          },
        ]
      : []),
    ...(hasPermission(me, 'menu', 'read') && navLocationSlug !== undefined
      ? [
          {
            title: t('menuStopList'),
            url: `/${navLocationSlug}/stop-list`,
            icon: Ban,
          },
        ]
      : []),
    ...(hasPermission(me, 'menu', 'read')
      ? [
          {
            title: t('menu'),
            url: '/menu/items',
            icon: UtensilsCrossed,
            isActive: false,
            items: [
              { title: t('menuCategories'), url: '/menu/categories' },
              { title: t('menuItems'), url: '/menu/items' },
              { title: t('menuModifiers'), url: '/menu/modifier-groups' },
            ],
          },
        ]
      : []),
  ];

  // Brand grain: these configure the restaurant company, not a point. Grouping them apart is the
  // same distinction the URL makes — no location slug in their addresses.
  const navAdministration: NavMainItem[] = [
    ...(hasPermission(me, 'location', 'create')
      ? [{ title: 'Locations', url: '/locations', icon: MapPin }]
      : []),
    ...(hasPermission(me, 'table', 'read') && navLocationSlug !== undefined
      ? [{ title: t('tables'), url: `/locations/${navLocationSlug}/tables`, icon: Table2 }]
      : []),
    ...(hasPermission(me, 'billing', 'read')
      ? [
          // Payments lives in settings for whoever can open settings; a billing-only role
          // still has its own page.
          hasPermission(me, 'settings', 'update')
            ? {
                title: t('payments'),
                url: '/settings',
                search: { setting: 'integrations' },
                icon: CreditCard,
              }
            : { title: t('payments'), url: '/tenant/payouts', icon: CreditCard },
          {
            title: t('transactions'),
            url: '/tenant/transactions',
            icon: Receipt,
            badge: refundFailedCount,
            badgeTone: 'destructive' as const,
            badgeAriaLabel: tTransactions('failedBadgeAria', { count: refundFailedCount }),
          },
        ]
      : []),
    ...(hasPermission(me, 'staff', 'invite')
      ? [{ title: t('team'), url: '/team', icon: Users }]
      : []),
    ...(hasPermission(me, 'ac', 'read') ? [{ title: 'Roles', url: '/roles', icon: KeyRound }] : []),
    ...(hasPermission(me, 'settings', 'update')
      ? [{ title: t('settings'), url: '/settings', icon: Settings2 }]
      : []),
  ];
  return (
    <Sidebar variant={variant} collapsible={collapsible} {...props}>
      <SidebarHeader>
        <TenantIdentity />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navOperations} label={t('groupOperations')} />
        <NavMain items={navAdministration} label={t('groupAdministration')} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
