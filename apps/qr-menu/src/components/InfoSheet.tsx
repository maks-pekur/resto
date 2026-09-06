'use client';

import { useCallback, useState } from 'react';
import {
  MailIcon,
  PhoneIcon,
  WebsiteIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useDragToDismiss,
  type GuestFooterContacts,
} from '@resto/ui';
import type { OpeningHoursDto, WifiAccessDto } from '@resto/api-client/public';
import { t } from '../i18n';
import { VenueGallery } from './VenueGallery';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** A guest reads this at the table, so their own clock is the venue's clock. */
const todayKey = (): string => WEEKDAYS[(new Date().getDay() + 6) % 7] ?? 'mon';

const minutesNow = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

const isOpenNow = (hours: OpeningHoursDto): boolean => {
  const now = minutesNow();
  const today = hours[todayKey()] ?? [];
  const yesterday = hours[WEEKDAYS[(new Date().getDay() + 5) % 7] ?? 'mon'] ?? [];
  const openIn = (from: number, to: number): boolean =>
    to > from ? now >= from && now < to : now >= from || now < to;
  return (
    today.some((i) => openIn(toMinutes(i.from), toMinutes(i.to))) ||
    // A shift that started yesterday and runs past midnight still counts as open.
    yesterday.some((i) => toMinutes(i.to) <= toMinutes(i.from) && now < toMinutes(i.to))
  );
};

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
  readonly photos?: readonly string[];
  readonly openingHours?: OpeningHoursDto | null;
  readonly wifi?: WifiAccessDto | null;
}

export const InfoSheet = ({
  open,
  onOpenChange,
  tenantName,
  description,
  contacts = {},
  socials = {},
  photos = [],
  openingHours = null,
  wifi = null,
}: InfoSheetProps) => {
  const [copied, setCopied] = useState(false);
  const dismiss = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const drag = useDragToDismiss(open, dismiss);
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
        showCloseButton={false}
        ref={drag.ref}
        side="bottom"
        style={{
          transform: drag.offset > 0 ? `translateY(${String(drag.offset)}px)` : undefined,
          transition: drag.dragging ? 'none' : undefined,
        }}
        className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto overscroll-contain rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        {/* Same grip as the item sheet: both came from the bottom edge and go back there. Over a
            photo it rides on top of it, so the banner reaches the sheet's own edge. */}
        {photos.length === 0 ? (
          <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        ) : null}
        <VenueGallery photos={photos} />
        <SheetHeader className="px-5 pt-4 pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <SheetTitle className="text-2xl font-extrabold">{tenantName}</SheetTitle>
            {openingHours === null ? null : (
              <span
                className={
                  isOpenNow(openingHours)
                    ? 'shrink-0 text-sm font-bold text-emerald-600'
                    : 'text-muted-foreground shrink-0 text-sm font-bold'
                }
              >
                {t(isOpenNow(openingHours) ? 'info.openNow' : 'info.closedNow')}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pt-6 pb-6">
          {description ? (
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          ) : null}

          {openingHours === null ? null : (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide uppercase">{t('info.hours')}</h3>
              <ul className="flex flex-col">
                {WEEKDAYS.map((day) => {
                  const intervals = openingHours[day] ?? [];
                  return (
                    <li
                      key={day}
                      className={`flex items-center justify-between py-1.5 text-sm ${
                        day === todayKey() ? 'font-bold' : ''
                      }`}
                    >
                      <span>{t(`weekday.${day}`)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {intervals.length === 0
                          ? t('info.closedDay')
                          : intervals.map((i) => `${i.from}–${i.to}`).join(', ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {wifi === null ? null : (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide uppercase">{t('info.wifi')}</h3>
              <div className="bg-muted flex flex-col gap-1 rounded-xl px-4 py-3">
                <p className="text-sm font-bold">{wifi.ssid}</p>
                {wifi.password === null ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(wifi.password ?? '').then(() => {
                        setCopied(true);
                      });
                    }}
                    className="flex cursor-pointer items-center gap-2 text-start text-sm"
                  >
                    <span className="tabular-nums">{wifi.password}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(copied ? 'info.copied' : 'info.copy')}
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}

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
