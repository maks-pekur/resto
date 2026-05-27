'use client';

import * as React from 'react';
import { LayoutDashboard, Settings2, Store } from 'lucide-react';

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
    title: 'Brands',
    url: '/dashboard',
    icon: Store,
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
  readonly canViewAllBrands: boolean;
  readonly operator: OperatorSummary;
}

export function AppSidebar({
  brands,
  activeBrandSlug,
  canViewAllBrands,
  operator,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BrandSwitcher
          brands={brands}
          activeBrandSlug={activeBrandSlug}
          canViewAllBrands={canViewAllBrands}
        />
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
