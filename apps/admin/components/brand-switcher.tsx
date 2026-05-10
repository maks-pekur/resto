'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Plus, LayoutGrid } from 'lucide-react';
import { setActiveBrandAction } from '@/lib/actions/set-active-brand';
import { BRAND_TAB_SYNC_STORAGE_KEY } from '@/components/brand-tab-sync';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export interface BrandOption {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface BrandSwitcherProps {
  readonly brands: readonly BrandOption[];
  readonly activeBrandSlug: string | null;
  readonly canViewAllBrands: boolean;
}

const ALL_BRANDS_LABEL = 'All brands';

export function BrandSwitcher({ brands, activeBrandSlug, canViewAllBrands }: BrandSwitcherProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const activeBrand = activeBrandSlug
    ? (brands.find((b) => b.slug === activeBrandSlug) ?? null)
    : null;
  const triggerLabel = activeBrand?.displayName ?? ALL_BRANDS_LABEL;
  const triggerSubLabel = activeBrand?.slug ?? '—';
  const showAllBrandsItem = canViewAllBrands && brands.length >= 2;

  const switchTo = (slug: string | null) => {
    startTransition(async () => {
      const result = await setActiveBrandAction(slug);
      if (!result.ok) return;
      try {
        window.localStorage.setItem(BRAND_TAB_SYNC_STORAGE_KEY, Date.now().toString());
      } catch {
        // Storage may be unavailable (private mode); cookie + revalidate
        // still take effect in the current tab.
      }
      router.refresh();
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" data-testid="brand-switcher-trigger">
              <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                {activeBrand ? (
                  <span className="text-xs font-semibold">
                    {initialsOf(activeBrand.displayName)}
                  </span>
                ) : (
                  <LayoutGrid className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{triggerLabel}</span>
                <span className="text-muted-foreground truncate text-xs">{triggerSubLabel}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            {brands.map((brand) => (
              <DropdownMenuItem
                key={brand.id}
                onSelect={() => {
                  switchTo(brand.slug);
                }}
              >
                <span className="truncate">{brand.displayName}</span>
              </DropdownMenuItem>
            ))}
            {showAllBrandsItem && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    switchTo(null);
                  }}
                >
                  <LayoutGrid className="size-4" />
                  <span>{ALL_BRANDS_LABEL}</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding/brand">
                <Plus className="size-4" />
                <span>Add brand</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const initialsOf = (displayName: string): string => {
  const words = displayName
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
};
