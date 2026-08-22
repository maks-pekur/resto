import { BadgeCheck, Building2, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTheme } from '@/components/theme-provider';
import { authClient } from '@/lib/auth-client';
import { meTenantsQuery, type OperatorSummary } from '@/lib/queries/identity';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LocaleSwitcherItems } from '@/components/locale-switcher-items';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const FALLBACK_ROLE_LABEL = 'Operator';

const capitalize = (s: string): string =>
  s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const avatarInitial = (email: string): string => email.charAt(0).toUpperCase() || '?';

export function NavUser({ operator }: { operator: OperatorSummary }) {
  const { isMobile } = useSidebar();
  const { setTheme } = useTheme();
  const { t } = useTranslation('translation', { keyPrefix: 'nav.user' });
  const navigate = useNavigate();
  const { data: tenantsResult } = useSuspenseQuery(meTenantsQuery());
  const initial = avatarInitial(operator.email);
  const roleLabel = operator.baseRole ? capitalize(operator.baseRole) : FALLBACK_ROLE_LABEL;
  // Same conditional-render shape as location-switcher.tsx:35 — staff and
  // single-organization owners see no item at all, not a disabled one (D-17).
  const canSwitchOrganization =
    operator.baseRole === 'owner' && (tenantsResult.data?.tenants.length ?? 0) >= 2;

  const signOut = async () => {
    await authClient.signOut();
    void navigate({ to: '/login' });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{roleLabel}</span>
                <span className="truncate text-xs">{operator.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{roleLabel}</span>
                  <span className="truncate text-xs">{operator.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canSwitchOrganization ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to="/pick-organization">
                      <Building2 />
                      {t('switchOrganizationItem')}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <BadgeCheck />
                  {t('accountItem')}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {t('themeLabel')}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  setTheme('light');
                }}
              >
                <Sun />
                {t('themeLight')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTheme('dark');
                }}
              >
                <Moon />
                {t('themeDark')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTheme('system');
                }}
              >
                <Monitor />
                {t('themeSystem')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {t('languageLabel')}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <LocaleSwitcherItems />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut className="size-4" />
              {t('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
