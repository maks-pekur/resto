import { useQuery } from '@tanstack/react-query';
import { meQuery } from '@/lib/queries/identity';

export interface UsePermissionsResult {
  readonly can: (resource: string, action: string) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { data } = useQuery(meQuery());
  const permissions = data?.data?.permissions ?? {};

  const can = (resource: string, action: string): boolean =>
    (permissions[resource] ?? []).includes(action);

  return { can };
}
