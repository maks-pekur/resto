'use client';

import {
  MailIcon,
  PhoneIcon,
  WebsiteIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  type GuestFooterContacts,
} from '@resto/ui';
import { t } from '../i18n';

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

export interface InfoSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tenantName: string;
  readonly description?: string | null;
  readonly contacts?: GuestFooterContacts;
  readonly socials?: Readonly<Record<string, string>>;
}

export const InfoSheet = ({
  open,
  onOpenChange,
  tenantName,
  description,
  contacts = {},
  socials = {},
}: InfoSheetProps) => {
  const rows = [
    contacts.phone
      ? {
          icon: PhoneIcon,
          label: contacts.phone,
          href: `tel:${contacts.phone.replace(/\s/gu, '')}`,
        }
      : null,
    contacts.email
      ? { icon: MailIcon, label: contacts.email, href: `mailto:${contacts.email}` }
      : null,
    contacts.website
      ? {
          icon: WebsiteIcon,
          label: contacts.website.replace(/^https?:\/\//u, ''),
          href: contacts.website,
        }
      : null,
  ].filter((row): row is { icon: typeof PhoneIcon; label: string; href: string } => row !== null);

  const socialEntries = Object.entries(socials).filter(([, href]) => href.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="px-5 py-4">
          <SheetTitle>{tenantName}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {description ? (
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          ) : null}

          {rows.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide uppercase">
                {t('info.contacts')}
              </h3>
              <ul className="flex flex-col">
                {rows.map((row) => (
                  <li key={row.href}>
                    <a
                      href={row.href}
                      className="hover:bg-muted flex items-center gap-3 rounded-lg py-2.5 text-sm"
                    >
                      <row.icon className="text-muted-foreground size-4 shrink-0" />
                      {row.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {socialEntries.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide uppercase">{t('info.socials')}</h3>
              <ul className="flex flex-wrap gap-2">
                {socialEntries.map(([platform, href]) => (
                  <li key={platform}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ring-border hover:bg-muted inline-flex rounded-full px-3 py-1.5 text-sm font-medium ring-1"
                    >
                      {SOCIAL_LABEL[platform] ?? platform}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
