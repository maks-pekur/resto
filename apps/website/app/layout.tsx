import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { buildTenantThemeVars } from '@resto/config-tailwind';
import { Toaster } from '@/components/ui/sonner';
import { fetchMenuPublic } from '@/lib/api-client';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RestOS',
  description: 'Order online from your favourite restaurant.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  let theme: { primaryColor?: string | null } | null = null;
  try {
    const menu = await fetchMenuPublic();
    theme = menu.tenant?.theme ?? null;
  } catch {
    // unresolved host / cold Redis / suspended — render default theme
  }

  const themeStyle = theme ? (buildTenantThemeVars(theme) as React.CSSProperties) : undefined;

  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable} style={themeStyle}>
      <head />
      <body className="bg-background text-foreground min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
