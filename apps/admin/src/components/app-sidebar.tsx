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
import { BrandSwitcher, type BrandOption } from '@/components/brand-switcher';
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
  readonly brands: readonly BrandOption[];
  readonly activeBrandSlug: string | null;
  readonly operator: OperatorSummary;
}

export function AppSidebar({
  brands,
  activeBrandSlug,
  operator,
  variant = 'inset',
  collapsible = 'icon',
  ...props
}: AppSidebarProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'nav' });
  const { t: tOrders } = useTranslation('translation', { keyPrefix: 'orders' });
  const brandPrefix = activeBrandSlug ? `/${activeBrandSlug}` : '';
  const isOwner = operator.baseRole === 'owner';
  const locationsEnabled = isOwner && activeBrandSlug !== null;
  const { data: locationsResult } = useQuery({
    ...meLocationsQuery(),
    enabled: locationsEnabled,
  });
  const locations = locationsResult?.data?.locations ?? [];

  const { locationId: effectiveLocationId } = useEffectiveLocation();
  const unacceptedFeedEnabled = activeBrandSlug !== null && effectiveLocationId !== undefined;
  const { data: unacceptedFeedResult } = useQuery({
    ...ordersFeedQuery(
      activeBrandSlug ?? '',
      effectiveLocationId ?? 'all',
      DEFAULT_ORDER_FEED_FILTERS,
    ),
    enabled: unacceptedFeedEnabled,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const unacceptedCount = (unacceptedFeedResult?.data?.rows ?? []).filter(
    (row) => row.status === 'paid' && row.acceptedAt === null,
  ).length;

  const navMain: NavMainItem[] = [
    {
      title: t('dashboard'),
      url: activeBrandSlug ? `/${activeBrandSlug}` : '/',
      icon: LayoutDashboard,
      scope: 'any',
    },
    {
      title: t('orders'),
      url: `${brandPrefix}/orders`,
      icon: ClipboardList,
      scope: 'brand',
      badge: unacceptedCount,
      badgeAriaLabel: tOrders('card.sidebarBadgeAria', { count: unacceptedCount }),
    },
    {
      title: t('menu'),
      url: `${brandPrefix}/menu/items`,
      icon: UtensilsCrossed,
      scope: 'brand',
      isActive: false,
      items: [
        { title: t('menuCategories'), url: `${brandPrefix}/menu/categories` },
        { title: t('menuItems'), url: `${brandPrefix}/menu/items` },
        { title: t('menuModifiers'), url: `${brandPrefix}/menu/modifier-groups` },
        { title: t('menuStopList'), url: `${brandPrefix}/menu/stop-list` },
      ],
    },
    {
      title: 'Locations',
      url: `${brandPrefix}/locations`,
      icon: MapPin,
      scope: 'brand',
    },
    {
      title: t('payments'),
      url: `${brandPrefix}/payouts`,
      icon: CreditCard,
      scope: 'brand',
    },
    {
      title: t('team'),
      url: `${brandPrefix}/team`,
      icon: Users,
      scope: 'tenant',
    },
    {
      title: 'Roles',
      url: `${brandPrefix}/roles`,
      icon: KeyRound,
      scope: 'tenant',
    },
    {
      title: t('settings'),
      url: `${brandPrefix}/settings`,
      icon: Settings2,
      scope: 'tenant',
    },
  ];
  return (
    <Sidebar variant={variant} collapsible={collapsible} {...props}>
      <SidebarHeader>
        <BrandSwitcher brands={brands} activeBrandSlug={activeBrandSlug} />
        <LocationSwitcher isOwner={isOwner} locations={locations} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} activeBrandSlug={activeBrandSlug} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser operator={operator} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
