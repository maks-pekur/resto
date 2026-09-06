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
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none">
          {logoUrl ? (
            <span className="relative size-8 shrink-0 overflow-hidden rounded-xl xs:size-9">
              <Image
                src={logoUrl}
                alt={tenantName}
                sizes="36px"
                priority
                className="size-full object-cover"
              />
            </span>
          ) : null}
          <span className="truncate text-base leading-tight font-extrabold xs:text-lg sm:text-xl">
            {tenantName}
          </span>
        </a>

        {/* The controls are 44px targets around 36px discs, so their own 4px of air would otherwise
            read as a wider margin than the content's. Pulling them out lines the discs up with it. */}
        <div className="-me-1 flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </header>
  );
};
