'use client';

import type { ReactNode } from 'react';
import { useGuestUi } from './guest-ui-provider';

export interface GuestHeaderProps {
  readonly tenantName: string;
  readonly logoUrl?: string | null;
  readonly actions?: ReactNode;
}

export const GuestHeader = ({ tenantName, logoUrl, actions }: GuestHeaderProps) => {
  const { Image } = useGuestUi();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 h-(--header-height) w-full border-b backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none">
          {logoUrl ? (
            <span className="relative size-9 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={logoUrl}
                alt={tenantName}
                sizes="36px"
                priority
                className="size-full object-cover"
              />
            </span>
          ) : null}
          <span className="truncate text-lg leading-tight font-extrabold sm:text-xl">
            {tenantName}
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </header>
  );
};
