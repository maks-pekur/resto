'use client';

import * as React from 'react';
import {
  BookOpen,
  Bot,
  Frame,
  LayoutDashboard,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from 'lucide-react';

import { BrandSwitcher, type BrandOption } from '@/components/brand-switcher';
import { BrandTabSync } from '@/components/brand-tab-sync';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavProjects } from '@/components/nav-projects';
import { NavUser } from '@/components/nav-user';
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
    title: 'Playground',
    url: '#',
    icon: SquareTerminal,
    isActive: true,
    scope: 'any',
    items: [
      { title: 'History', url: '#' },
      { title: 'Starred', url: '#' },
      { title: 'Settings', url: '#' },
    ],
  },
  {
    title: 'Models',
    url: '#',
    icon: Bot,
    scope: 'any',
    items: [
      { title: 'Genesis', url: '#' },
      { title: 'Explorer', url: '#' },
      { title: 'Quantum', url: '#' },
    ],
  },
  {
    title: 'Documentation',
    url: '#',
    icon: BookOpen,
    scope: 'any',
    items: [
      { title: 'Introduction', url: '#' },
      { title: 'Get Started', url: '#' },
      { title: 'Tutorials', url: '#' },
      { title: 'Changelog', url: '#' },
    ],
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: Settings2,
    scope: 'tenant',
  },
];

const projects = [
  { name: 'Design Engineering', url: '#', icon: Frame },
  { name: 'Sales & Marketing', url: '#', icon: PieChart },
  { name: 'Travel', url: '#', icon: Map },
];

const placeholderUser = {
  name: 'Operator',
  email: 'operator@example.com',
  avatar: '/avatars/shadcn.jpg',
};

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  readonly brands: readonly BrandOption[];
  readonly activeBrandSlug: string | null;
  readonly canViewAllBrands: boolean;
}

export function AppSidebar({
  brands,
  activeBrandSlug,
  canViewAllBrands,
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
        <NavProjects projects={projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={placeholderUser} />
      </SidebarFooter>
      <SidebarRail />
      <BrandTabSync />
    </Sidebar>
  );
}
