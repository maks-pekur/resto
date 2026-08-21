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
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { TenantIdentity } from '@/components/tenant-identity';
import { LocationSwitcher } from '@/components/location-switcher';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import type { OperatorSummary } from '@/lib/queries/identity';
import { meLocationsQuery } from '@/lib/queries/locations';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { DEFAULT_ORDER_FEED_FILTERS, ordersFeedQuery } from '@/lib/queries/orders';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  readonly operator: OperatorSummary;
}

export function AppSidebar({
  operator,
  variant = 'inset',
  collapsible = 'icon',
  ...props
}: AppSidebarProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'nav' });
  const { t: tOrders } = useTranslation('translation', { keyPrefix: 'orders' });
  const isOwner = operator.baseRole === 'owner';
  const { data: locationsResult } = useQuery({
    ...meLocationsQuery(),
    enabled: isOwner,
  });
  const locations = locationsResult?.data?.locations ?? [];

  const { locationId: effectiveLocationId } = useEffectiveLocation();
  const { data: unacceptedFeedResult } = useQuery({
    ...ordersFeedQuery(effectiveLocationId ?? 'all', DEFAULT_ORDER_FEED_FILTERS),
    enabled: effectiveLocationId !== undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const unacceptedCount = (unacceptedFeedResult?.data?.rows ?? []).filter(
    (row) => row.status === 'paid' && row.acceptedAt === null,
  ).length;

  const navMain: NavMainItem[] = [
    {
      title: t('dashboard'),
      url: '/',
      icon: LayoutDashboard,
    },
    {
      title: t('orders'),
      url: '/orders',
      icon: ClipboardList,
      badge: unacceptedCount,
      badgeAriaLabel: tOrders('card.sidebarBadgeAria', { count: unacceptedCount }),
    },
    {
      title: t('menu'),
      url: '/menu/items',
      icon: UtensilsCrossed,
      isActive: false,
      items: [
        { title: t('menuCategories'), url: '/menu/categories' },
        { title: t('menuItems'), url: '/menu/items' },
        { title: t('menuModifiers'), url: '/menu/modifier-groups' },
        { title: t('menuStopList'), url: '/menu/stop-list' },
      ],
    },
    {
      title: 'Locations',
      url: '/locations',
      icon: MapPin,
    },
    {
      title: t('payments'),
      url: '/tenant/payouts',
      icon: CreditCard,
    },
    {
      title: t('team'),
      url: '/team',
      icon: Users,
    },
    {
      title: 'Roles',
      url: '/roles',
      icon: KeyRound,
    },
    {
      title: t('settings'),
      url: '/settings',
      icon: Settings2,
    },
  ];
  return (
    <Sidebar variant={variant} collapsible={collapsible} {...props}>
      <SidebarHeader>
        <TenantIdentity />
        <LocationSwitcher isOwner={isOwner} locations={locations} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser operator={operator} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
