'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface TodaysWidgetProps {
  readonly count: number;
}

export function TodaysWidget({ count }: TodaysWidgetProps): React.ReactElement {
  const t = useTranslations('menu.stopList');
  const isEmpty = count === 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('todayTitle')}</CardTitle>
          <Badge variant={isEmpty ? 'secondary' : 'destructive'} aria-label={t('todayBadgeAria')}>
            {count}
          </Badge>
        </div>
        <CardDescription>{isEmpty ? t('todayEmpty') : t('todayDescription')}</CardDescription>
      </CardHeader>
    </Card>
  );
}
