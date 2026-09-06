import { getTranslations } from 'next-intl/server';

export async function ApexLanding() {
  const t = await getTranslations('marketing');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground max-w-md text-base">{t('tagline')}</p>
      {/* A different app on this origin (07.5-12) — next/link's typed client-side
          transition has no route for it, so this needs a real navigation. */}
      <a
        href="/admin"
        className="bg-primary text-primary-foreground rounded-full px-6 py-3 text-sm font-bold"
      >
        {t('adminCta')}
      </a>
    </main>
  );
}
