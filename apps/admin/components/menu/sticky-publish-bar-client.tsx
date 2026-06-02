'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { cancelPublishAction } from '@/lib/menu/cancel-publish-action';
import { schedulePublishAction } from '@/lib/menu/schedule-publish-action';
import type { DraftDiffEntry } from '@/lib/menu/types';
import { PublishCountdownToast } from './publish-countdown-toast';
import { StatusBadge } from './status-badge';

// Constant toast id so countdown / success / error replace in place via Sonner instead of stacking.
const TOAST_ID = 'publish-countdown' as const;
const SUCCESS_AUTO_DISMISS_MS = 3_000;

export interface StickyPublishBarClientProps {
  readonly unpublishedCount: number;
  readonly diffItems: readonly DraftDiffEntry[];
  readonly truncatedCount?: number;
}

export function StickyPublishBarClient({
  unpublishedCount,
  diffItems,
  truncatedCount,
}: StickyPublishBarClientProps): React.ReactElement | null {
  const t = useTranslations('menu.publishBar');
  const ENTITY_LABEL: Record<DraftDiffEntry['entityType'], string> = {
    item: t('entityItem'),
    category: t('entityCategory'),
    'modifier-group': t('entityModifierGroup'),
  };

  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isDiffOpen, setIsDiffOpen] = React.useState(false);

  if (unpublishedCount === 0) {
    return null;
  }

  const handleCancel = async (): Promise<void> => {
    const res = await cancelPublishAction();
    if (!res.ok) {
      showError(null, t('cancelFailed'), { id: TOAST_ID });
    } else if (res.cancelled) {
      showSuccess(t('cancelledToast'), { id: TOAST_ID });
    } else {
      toast.info(t('alreadyPublishedToast'), { id: TOAST_ID });
    }
    setIsPublishing(false);
  };

  const handleElapse = (): void => {
    showSuccess(t('publishedToast'), { id: TOAST_ID, duration: SUCCESS_AUTO_DISMISS_MS });
    setIsPublishing(false);
  };

  const handlePublish = async (): Promise<void> => {
    setIsPublishing(true);
    const res = await schedulePublishAction();
    if (!res.ok) {
      showError(res.error, undefined, { id: TOAST_ID });
      setIsPublishing(false);
      return;
    }
    toast.custom(
      () => <PublishCountdownToast onCancel={() => void handleCancel()} onElapse={handleElapse} />,
      { id: TOAST_ID, duration: Infinity },
    );
  };

  return (
    <div
      role="region"
      aria-label={t('ariaRegion')}
      className="fixed right-0 bottom-0 left-[--sidebar-width] z-40 h-14 bg-card border-t border-border shadow-lg"
    >
      <div className="flex h-full items-center gap-4 px-6">
        <span className="text-sm font-semibold">
          {t('unpublishedChanges', { count: unpublishedCount })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsDiffOpen((v) => !v);
          }}
        >
          {t('showDiff')}
          {isDiffOpen ? (
            <ChevronUp className="ml-1 size-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="ml-1 size-3" aria-hidden="true" />
          )}
        </Button>
        <div className="ml-auto">
          {isPublishing ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button type="button" variant="default" size="sm" disabled>
                    {t('publishMenuBtn')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('publishingTooltip')}</TooltipContent>
            </Tooltip>
          ) : (
            <Button type="button" variant="default" size="sm" onClick={() => void handlePublish()}>
              {t('publishMenuBtn')}
            </Button>
          )}
        </div>
      </div>
      <div
        className={cn(
          'absolute right-0 bottom-14 left-0 transition-[max-height] duration-200',
          isDiffOpen
            ? 'max-h-64 overflow-auto bg-card border-t border-border'
            : 'max-h-0 overflow-hidden',
        )}
      >
        <ul className="divide-y divide-border">
          {diffItems.map((entry) => (
            <li
              key={`${entry.entityType}:${entry.id}`}
              className="flex items-center gap-3 px-6 py-2"
            >
              <span className="text-xs text-muted-foreground w-40">
                {ENTITY_LABEL[entry.entityType]}
              </span>
              <span className="flex-1 text-sm">{entry.name}</span>
              <StatusBadge status={entry.status} />
            </li>
          ))}
        </ul>
        {truncatedCount !== undefined && truncatedCount > 0 ? (
          <p className="px-6 py-2 text-xs text-muted-foreground">
            {t('moreLine', { count: truncatedCount })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
