'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoUploadClient } from './photo-upload-client';
import type { Status } from '@/lib/menu/types';

export interface ItemAsideClientProps {
  readonly itemId: string;
  readonly currentPhotoS3Key: string | null;
  readonly currentPhotoUrl: string | null;
  readonly onPhotoChange: (s3Key: string) => void;
  readonly status: Status;
  readonly slug: string;
}

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  modified: 'secondary',
  published: 'default',
  paused: 'destructive',
  archived: 'secondary',
};

export function ItemAsideClient({
  itemId,
  currentPhotoS3Key,
  currentPhotoUrl,
  onPhotoChange,
  status,
  slug,
}: ItemAsideClientProps): React.ReactElement {
  const t = useTranslations('menu.editor');
  const tStatus = useTranslations('menu.status');
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('photoTitle')}</CardTitle>
          <CardDescription>{t('photoDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploadClient
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
