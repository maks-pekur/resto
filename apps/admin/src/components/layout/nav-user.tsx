import { BadgeCheck, Building2, ChevronsUpDown, LogOut } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSuspenseQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { meTenantsQuery, type OperatorSummary } from '@/lib/queries/identity';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const FALLBACK_ROLE_LABEL = 'Operator';

const capitalize = (s: string): string =>
  s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const avatarInitial = (email: string): string => email.charAt(0).toUpperCase() || '?';

export function NavUser({ operator }: { operator: OperatorSummary }) {
  const { t } = useTranslation('translation', { keyPrefix: 'nav.user' });
  const navigate = useNavigate();
  const { data: tenantsResult } = useSuspenseQuery(meTenantsQuery());
  const initial = avatarInitial(operator.email);
  const roleLabel = operator.baseRole ? capitalize(operator.baseRole) : FALLBACK_ROLE_LABEL;
  // Staff and single-tenant owners see no item at all, not a disabled one (D-17). The
  // location switcher used to share this shape; it was removed on 2026-08-30.
  const canSwitchTenant =
    operator.baseRole === 'owner' && (tenantsResult.data?.tenants.length ?? 0) >= 2;

  const signOut = async () => {
    await authClient.signOut();
    void navigate({ to: '/login' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-testid="nav-user-trigger"
          className="h-auto gap-2 px-2 py-1.5 data-[state=open]:bg-accent"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
          </Avatar>
          {/* The identity text is noise on a phone — the avatar carries it there. */}
          <div className="hidden text-left text-sm leading-tight sm:grid">
            <span className="truncate font-medium">{roleLabel}</span>
            <span className="text-muted-foreground truncate text-xs">{operator.email}</span>
          </div>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 rounded-lg" align="end" sideOffset={8}>
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
        {canSwitchTenant ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/pick-tenant" data-testid="nav-switch-tenant">
                  <Building2 />
                  {t('switchTenantItem')}
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
  );
}
