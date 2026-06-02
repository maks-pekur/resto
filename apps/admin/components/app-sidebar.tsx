'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Settings2, Users, UtensilsCrossed } from 'lucide-react';

import { BrandSwitcher, type BrandOption } from '@/components/brand-switcher';
import { BrandTabSync } from '@/components/brand-tab-sync';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import type { OperatorSummary } from '@/lib/me';
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
  const t = useTranslations('nav');
  const navMain: NavMainItem[] = [
    {
      title: t('dashboard'),
      url: '/dashboard',
      icon: LayoutDashboard,
      scope: 'any',
    },
    {
      title: t('menu'),
      url: '/dashboard/menu/items',
      icon: UtensilsCrossed,
      scope: 'brand',
      isActive: false,
      items: [
        { title: t('menuCategories'), url: '/dashboard/menu/categories' },
        { title: t('menuItems'), url: '/dashboard/menu/items' },
        { title: t('menuModifiers'), url: '/dashboard/menu/modifier-groups' },
        { title: t('menuStopList'), url: '/dashboard/menu/stop-list' },
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
      <BrandTabSync />
    </Sidebar>
  );
}
