'use client';

import * as React from 'react';
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

const navMain: NavMainItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
    scope: 'any',
  },
  {
    title: 'Меню',
    url: '/dashboard/menu/items',
    icon: UtensilsCrossed,
    scope: 'brand',
    isActive: false,
    items: [
      { title: 'Категории', url: '/dashboard/menu/categories' },
      { title: 'Блюда', url: '/dashboard/menu/items' },
      { title: 'Модификаторы', url: '/dashboard/menu/modifier-groups' },
      { title: 'Стоп-лист', url: '/dashboard/menu/stop-list' },
    ],
  },
  {
    title: 'Team',
    url: '/dashboard/team',
    icon: Users,
    scope: 'tenant',
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: Settings2,
    scope: 'tenant',
  },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  readonly brands: readonly BrandOption[];
  readonly activeBrandSlug: string | null;
  readonly operator: OperatorSummary;
}

export function AppSidebar({ brands, activeBrandSlug, operator, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
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
