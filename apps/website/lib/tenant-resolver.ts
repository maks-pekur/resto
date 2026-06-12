import 'server-only';
import { headers } from 'next/headers';

export const getTenantSlugFromHeaders = async (): Promise<string | null> => {
  const h = await headers();
  return h.get('x-tenant-slug');
};
