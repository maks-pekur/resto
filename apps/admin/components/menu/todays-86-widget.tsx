import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TodaysWidgetResetButton } from './todays-86-reset-button-client';

export interface TodaysWidgetProps {
  readonly count: number;
}

export function TodaysWidget({ count }: TodaysWidgetProps): React.ReactElement {
  const isEmpty = count === 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Стоп-лист сегодня</CardTitle>
          <Badge variant={isEmpty ? 'secondary' : 'destructive'} aria-label="Позиций в стоп-листе">
            {count}
          </Badge>
        </div>
        <CardDescription>
          {isEmpty ? 'Стоп-лист пуст.' : 'Все остановленные позиции будут возобновлены.'}
        </CardDescription>
      </CardHeader>
      {isEmpty ? null : (
        <CardContent>
          <TodaysWidgetResetButton />
        </CardContent>
      )}
    </Card>
  );
}
