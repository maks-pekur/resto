import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronIcon,
  ExternalIcon,
  MapPinIcon,
  PhoneIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  ThemeIcon,
  UserIcon,
} from '@resto/ui';
import type { LegalDocumentKeyDto, LegalDocumentsDto, VenueDto } from '@resto/api-client/public';
import { fetchLegalDocuments } from '../api/client';
import { localized, t } from '../i18n';

const SOCIAL_LABEL: Readonly<Record<string, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  x: 'X',
  tripadvisor: 'Tripadvisor',
  googleMaps: 'Google',
  yandexMaps: 'Яндекс',
  twogis: '2ГИС',
};

const USEFUL: readonly LegalDocumentKeyDto[] = ['about', 'payment', 'returns'];
const LEGAL: readonly LegalDocumentKeyDto[] = ['cookies', 'terms', 'privacy'];

const mapsHref = (venue: VenueDto): string =>
  venue.latitude !== null && venue.longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${String(venue.latitude)},${String(venue.longitude)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address ?? '')}`;

export interface GuestDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tenantName: string;
  readonly venue: VenueDto | null;
  readonly socials: Readonly<Record<string, string>>;
  readonly onSignIn: () => void;
  readonly onOpenDocument: (title: string, body: string) => void;
  readonly themeControl: ReactNode;
}

/**
 * Everything the app is besides its menu. It comes from the left because the tab bar owns the
 * bottom edge and the cart the right, and it is ordered by how often a guest needs it: who they
 * are, how to reach the place, and only then the paperwork.
 */
export const GuestDrawer = ({
  open,
  onOpenChange,
  tenantName,
  venue,
  socials,
  onSignIn,
  onOpenDocument,
  themeControl,
}: GuestDrawerProps) => {
  const [documents, setDocuments] = useState<LegalDocumentsDto | null>(null);

  // Fetched when the drawer first opens: a guest who never opens it pays nothing for the text.
  useEffect(() => {
    if (!open || documents !== null) return;
    const controller = new AbortController();
    fetchLegalDocuments(controller.signal)
      .then(setDocuments)
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [open, documents]);

  const socialEntries = Object.entries(socials).filter(([, href]) => href.length > 0);
  const documentRows = (keys: readonly LegalDocumentKeyDto[]) =>
    keys
      .map((key) => ({ key, body: localized(documents?.[key]) }))
      .filter((row) => row.body.length > 0);

  const useful = documentRows(USEFUL);
  const legal = documentRows(LEGAL);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[86vw] max-w-xs gap-0 overflow-y-auto p-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="truncate text-xl font-extrabold">{tenantName}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pt-2">
          <section className="bg-muted flex flex-col gap-3 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="bg-background grid size-10 shrink-0 place-items-center rounded-full">
                <UserIcon className="size-5" />
              </span>
              <p className="text-muted-foreground text-sm leading-snug">{t('drawer.signInBody')}</p>
            </div>
            <button
              type="button"
              data-testid="drawer-account"
              onClick={() => {
                onOpenChange(false);
                onSignIn();
              }}
              className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-11 w-full cursor-pointer items-center justify-center rounded-full px-4 text-sm font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('drawer.signIn')}
            </button>
          </section>

          {venue?.address === null && venue.phone === null ? null : (
            <Section title={t('drawer.contacts')}>
              {venue?.address ? (
                <a
                  href={mapsHref(venue)}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-testid="drawer-address"
                  className="hover:bg-muted flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold"
                >
                  <MapPinIcon className="text-muted-foreground size-5 shrink-0" />
                  <span className="flex-1">{venue.address}</span>
                  <ExternalIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                </a>
              ) : null}
              {venue?.phone ? (
                <a
                  href={`tel:${venue.phone.replace(/\s/gu, '')}`}
                  className="hover:bg-muted flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold"
                >
                  <PhoneIcon className="text-muted-foreground size-5 shrink-0" />
                  <span className="flex-1">{venue.phone}</span>
                </a>
              ) : null}
            </Section>
          )}

          {socialEntries.length === 0 ? null : (
            <Section title={t('drawer.socials')}>
              <ul className="flex flex-wrap gap-2 px-2 pt-1">
                {socialEntries.map(([platform, href]) => (
                  <li key={platform}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ring-border hover:bg-muted inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1"
                    >
                      {SOCIAL_LABEL[platform] ?? platform}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {useful.length === 0 ? null : (
            <Section title={t('drawer.useful')}>
              {useful.map((row) => (
                <DocumentRow
                  key={row.key}
                  label={t(`drawer.doc.${row.key}`)}
                  onSelect={() => {
                    onOpenChange(false);
                    onOpenDocument(t(`drawer.doc.${row.key}`), row.body);
                  }}
                />
              ))}
            </Section>
          )}

          <Section title={t('drawer.appearance')}>
            <div className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold">
              <ThemeIcon className="text-muted-foreground size-5 shrink-0" />
              <span className="flex-1">{t('theme.label')}</span>
              {themeControl}
            </div>
          </Section>

          {legal.length === 0 ? null : (
            <Section title={t('drawer.legal')}>
              {legal.map((row) => (
                <DocumentRow
                  key={row.key}
                  label={t(`drawer.doc.${row.key}`)}
                  onSelect={() => {
                    onOpenChange(false);
                    onOpenDocument(t(`drawer.doc.${row.key}`), row.body);
                  }}
                />
              ))}
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col">
    <h3 className="text-muted-foreground px-2 pb-1 text-xs font-bold tracking-wide uppercase">
      {title}
    </h3>
    {children}
  </section>
);

const DocumentRow = ({ label, onSelect }: { label: string; onSelect: () => void }) => (
  <button
    type="button"
    data-testid={`drawer-doc-${label}`}
    onClick={onSelect}
    className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 text-start text-sm font-semibold transition-colors"
  >
    <span className="flex-1">{label}</span>
    <ChevronIcon className="text-muted-foreground size-4 shrink-0" />
  </button>
);
