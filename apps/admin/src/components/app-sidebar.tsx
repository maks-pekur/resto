import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Settings2, Users, UtensilsCrossed } from 'lucide-react';
import { BrandSwitcher, type BrandOption } from '@/components/brand-switcher';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import type { OperatorSummary } from '@/lib/queries/identity';
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
  const brandPrefix = activeBrandSlug ? `/${activeBrandSlug}` : '';
  const navMain: NavMainItem[] = [
    {
      title: t('dashboard'),
      url: '/dashboard',
      icon: LayoutDashboard,
      scope: 'any',
    },
    {
      title: t('menu'),
      url: `${brandPrefix}/dashboard/menu/items`,
      icon: UtensilsCrossed,
      scope: 'brand',
      isActive: false,
      items: [
        { title: t('menuCategories'), url: `${brandPrefix}/dashboard/menu/categories` },
        { title: t('menuItems'), url: `${brandPrefix}/dashboard/menu/items` },
        { title: t('menuModifiers'), url: `${brandPrefix}/dashboard/menu/modifier-groups` },
        { title: t('menuStopList'), url: `${brandPrefix}/dashboard/menu/stop-list` },
      ],
    },
    {
      title: t('team'),
      url: '/dashboard/team',
      icon: Users,
      scope: 'tenant',
    },
    {
      title: t('settings'),
      url: '/dashboard/settings',
      icon: Settings2,
      scope: 'tenant',
    },
  ];
  return (
    <Sidebar variant={variant} collapsible={collapsible} {...props}>
      <SidebarHeader>
        <BrandSwitcher brands={brands} activeBrandSlug={activeBrandSlug} />
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
