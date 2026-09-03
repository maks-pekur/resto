import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getPhotoUploadUrl } from '@/lib/queries/catalog';

const ALLOWED_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PUT_TIMEOUT_MS = 60_000;

export interface PhotoUploadProps {
  readonly itemId: string;
  readonly currentS3Key: string | null;
  readonly currentPhotoUrl?: string | null;
  readonly onUploaded: (s3Key: string) => void;
  readonly kind?: 'item' | 'ingredient';
}

type UploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'requesting' }
  | { readonly kind: 'uploading' }
  | { readonly kind: 'error'; readonly message: string };

export function PhotoUpload({
  itemId: _itemId,
  currentS3Key,
  currentPhotoUrl,
  onUploaded,
  kind = 'item',
}: PhotoUploadProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [state, setState] = React.useState<UploadState>({ kind: 'idle' });
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [committedUrl, setCommittedUrl] = React.useState<string | null>(currentPhotoUrl ?? null);

  React.useEffect(() => {
    setCommittedUrl(currentPhotoUrl ?? null);
  }, [currentPhotoUrl]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const urlMutation = useMutation({ mutationFn: getPhotoUploadUrl });

  const handleFile = async (file: File): Promise<void> => {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_SIZE_BYTES) {
      setState({ kind: 'error', message: t('photoAllowlistError') });
      return;
    }
    setState({ kind: 'requesting' });
    const urlRes = await urlMutation.mutateAsync({
      contentType: file.type,
      sizeBytes: file.size,
      kind,
    });
    if (!urlRes.ok || !urlRes.data) {
      setState({ kind: 'error', message: t('photoUploadFailed') });
      return;
    }
    setState({ kind: 'uploading' });
    try {
      const putRes = await fetch(urlRes.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
        signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
      });
      if (!putRes.ok) {
        setState({ kind: 'error', message: t('photoUploadFailed') });
        return;
      }
    } catch {
      setState({ kind: 'error', message: t('photoUploadFailed') });
      return;
    }
    const newPreview = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(newPreview);
    setCommittedUrl(null);
    setState({ kind: 'idle' });
    onUploaded(urlRes.data.s3Key);
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLLabelElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const visiblePhoto = previewUrl ?? committedUrl;
  const hasPhoto = Boolean(visiblePhoto) || Boolean(currentS3Key && !previewUrl);
  const inputId = React.useId();
  const isBusy = state.kind === 'requesting' || state.kind === 'uploading';
  const busyLabel = state.kind === 'requesting' ? t('photoRequesting') : t('photoUploading');

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onInputChange}
        aria-label={t('photoFileAriaLabel')}
      />
      <label
        htmlFor={inputId}
        role="button"
        tabIndex={0}
        aria-label={hasPhoto ? t('photoReplaceAriaLabel') : t('photoUploadAriaLabel')}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        className="group relative flex h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visiblePhoto ? (
          <img
            src={visiblePhoto}
            alt={t('photoAlt')}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <>
            <ImageIcon className="size-6" aria-hidden="true" />
            <span className="text-sm">{t('photoDropHint')}</span>
            <span className="text-xs">{t('photoFormatsHint')}</span>
          </>
        )}
        {hasPhoto ? (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-background/80 px-2 py-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {t('photoChange')}
          </span>
        ) : null}
      </label>

      {isBusy ? (
        <div className="space-y-1">
          <Progress className="h-1" />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {busyLabel}
          </p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <p className="text-xs text-destructive" aria-live="assertive">
          {state.message}
        </p>
      ) : null}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button type="button" variant="ghost" size="sm" disabled className="text-xs">
                {t('photoAddMore')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t('photoMultiTooltip')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
