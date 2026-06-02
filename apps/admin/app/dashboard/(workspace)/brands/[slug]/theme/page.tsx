import { getTranslations } from 'next-intl/server';
import { PageHeading } from '@/components/page-heading';

export default async function BrandThemePage(_: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations('dashboard');
  return (
    <>
      <PageHeading title={t('brandThemeTitle')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Per-brand theme editor ships with RES-91.</p>
      </div>
    </>
  );
}
