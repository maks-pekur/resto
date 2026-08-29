import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import { GuestUi } from '@/components/guest-ui';
import { SiteToaster } from '@/components/site-toaster';
import { fetchMenuPublic } from '@/lib/api-client';
import '@fontsource-variable/nunito';
import './globals.css';

export const metadata: Metadata = {
  title: 'RestOS',
  description: 'Order online from your favourite restaurant.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  let theme: { primaryColor?: string | null } | null = null;
  try {
    const menu = await fetchMenuPublic();
    theme = menu.tenant?.theme ?? null;
  } catch {
    // unresolved host / cold cache / suspended — render default theme
  }

  const themeStyle = theme ? (buildTenantThemeVars(theme) as React.CSSProperties) : undefined;

  return (
    <html lang={locale} suppressHydrationWarning style={themeStyle}>
      <head>
        {/* The stored preference has to reach <html> before the first paint —
            the hook that owns it runs a full flash of the wrong palette later. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('resto.theme');document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'system')}catch(e){}",
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GuestUi>
            {children}
            <SiteToaster />
          </GuestUi>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
