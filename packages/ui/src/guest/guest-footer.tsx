'use client';

import type { ReactNode } from 'react';
import { useGuestUi } from './guest-ui-provider';

export interface GuestFooterLink {
  readonly label: string;
  readonly href: string;
}

export interface GuestFooterContacts {
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly website?: string | null;
}

export interface GuestFooterProps {
  readonly tenantName: string;
  readonly logoUrl?: string | null;
  readonly description?: string | null;
  readonly socials?: Readonly<Record<string, string>>;
  readonly contacts?: GuestFooterContacts;
  readonly links?: readonly GuestFooterLink[];
  readonly actions?: ReactNode;
}

/** Named rather than glyphed on purpose: a wrong or unlicensed brand mark is worse than a word. */
const SOCIAL_LABEL: Readonly<Record<string, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  x: 'X',
  tripadvisor: 'Tripadvisor',
};

export const GuestFooter = ({
  tenantName,
  logoUrl,
  description,
  socials = {},
  contacts = {},
  links = [],
  actions,
}: GuestFooterProps) => {
  const { t, Image } = useGuestUi();
  const socialEntries = Object.entries(socials).filter(([, href]) => href.length > 0);
  const contactEntries: readonly { readonly label: string; readonly href: string }[] = [
    contacts.phone
      ? { label: contacts.phone, href: `tel:${contacts.phone.replace(/\s/gu, '')}` }
      : null,
    contacts.email ? { label: contacts.email, href: `mailto:${contacts.email}` } : null,
    contacts.website
      ? { label: contacts.website.replace(/^https?:\/\//u, ''), href: contacts.website }
      : null,
  ].filter((entry): entry is { label: string; href: string } => entry !== null);

  return (
    <footer className="bg-muted mt-16 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <span className="relative size-11 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={logoUrl}
                    alt={tenantName}
                    sizes="44px"
                    className="size-full object-cover"
                  />
                </span>
              ) : null}
              <span className="text-lg font-extrabold">{tenantName}</span>
            </div>
            {description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            ) : null}
            {contactEntries.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {contactEntries.map((contact) => (
                  <li key={contact.href}>
                    <a
                      href={contact.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {contact.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
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

          {socialEntries.length > 0 ? (
            <nav aria-label={t('footer.socialsLabel')}>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {socialEntries.map(([platform, href]) => (
                  <li key={platform}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
                    >
                      {SOCIAL_LABEL[platform] ?? platform}
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
