import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
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
}

export function BrandSwitcher({ brands, activeBrandSlug }: BrandSwitcherProps) {
  const navigate = useNavigate();
  const activeBrand =
    (activeBrandSlug ? brands.find((b) => b.slug === activeBrandSlug) : undefined) ??
    brands[0] ??
    null;
  const triggerLabel = activeBrand?.displayName ?? '—';
  const triggerSubLabel = activeBrand?.slug ?? '—';

  const switchTo = async (brand: BrandOption) => {
    await authClient.organization.setActive({ organizationId: brand.id });
    void navigate({ to: '/dashboard/$brandSlug', params: { brandSlug: brand.slug } });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" data-testid="brand-switcher-trigger">
              <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <span className="text-xs font-semibold">
                  {activeBrand ? initialsOf(activeBrand.displayName) : '?'}
                </span>
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
                  void switchTo(brand);
                }}
              >
                <span className="truncate">{brand.displayName}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding/brand">
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
