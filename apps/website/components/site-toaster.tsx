'use client';

import { Toaster } from '@resto/ui';
import { useSiteTheme } from '@/components/guest-ui';

export function SiteToaster() {
  const { resolvedTheme } = useSiteTheme();

  return <Toaster position="bottom-center" theme={resolvedTheme} />;
}
