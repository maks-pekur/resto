import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoUpload } from '@/components/menu/photo-upload';
import type { Status } from '@/lib/menu/types';

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  modified: 'secondary',
  published: 'default',
  paused: 'secondary',
  archived: 'secondary',
};

export interface ItemAsideProps {
  readonly brandSlug: string;
  readonly itemId: string;
  readonly currentPhotoS3Key: string | null;
  readonly currentPhotoUrl: string | null;
  readonly onPhotoChange: (s3Key: string) => void;
  readonly status: Status;
  readonly slug: string;
}

export function ItemAside({
  brandSlug,
  itemId,
  currentPhotoS3Key,
  currentPhotoUrl,
  onPhotoChange,
  status,
  slug,
}: ItemAsideProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { t: tStatus } = useTranslation('translation', { keyPrefix: 'menu.status' });
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('photoTitle')}</CardTitle>
          <CardDescription>{t('photoDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUpload
            brandSlug={brandSlug}
            itemId={itemId}
            currentS3Key={currentPhotoS3Key}
            currentPhotoUrl={currentPhotoUrl}
            onUploaded={onPhotoChange}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('statusSectionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Badge variant={STATUS_VARIANT[status]} className="w-fit">
            {tStatus(status)}
          </Badge>
          <p className="text-muted-foreground text-xs">{t('statusReadonlyHint')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('techInfoSectionTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[6rem_1fr] items-baseline gap-2 text-sm">
            <span className="text-muted-foreground">{t('slugLabel')}</span>
            <span className="break-all font-mono">{slug || '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
