'use client';

import type { ReactNode } from 'react';
import { useGuestUi } from './guest-ui-provider';

export interface GuestFooterLink {
  readonly label: string;
  readonly href: string;
}

export interface GuestFooterProps {
  readonly tenantName: string;
  readonly logoUrl?: string | null;
  readonly links?: readonly GuestFooterLink[];
  readonly actions?: ReactNode;
}

export const GuestFooter = ({ tenantName, logoUrl, links = [], actions }: GuestFooterProps) => {
  const { t, Image } = useGuestUi();

  return (
    <footer className="bg-muted mt-16 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={tenantName}
                className="size-11 shrink-0 rounded-xl object-cover"
              />
            ) : null}
            <span className="text-lg font-extrabold">{tenantName}</span>
          </div>

          {links.length > 0 ? (
            <nav aria-label={tenantName}>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {actions}
        </div>

        <p className="text-muted-foreground border-t pt-6 text-xs">{t('footer.poweredBy')}</p>
      </div>
    </footer>
  );
};
