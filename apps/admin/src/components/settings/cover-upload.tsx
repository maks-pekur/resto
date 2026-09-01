import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getBrandLogoUploadUrl } from '@/lib/queries/tenancy';

const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const PUT_TIMEOUT_MS = 60_000;

export interface CoverUploadProps {
  readonly coverUrl: string | null;
  readonly onUploaded: (s3Key: string, previewUrl: string) => void;
  readonly onCleared: () => void;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'error'; readonly message: string };

export function CoverUpload({ coverUrl, onUploaded, onCleared }: CoverUploadProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.brand' });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [state, setState] = React.useState<State>({ kind: 'idle' });

  const urlMutation = useMutation({ mutationFn: getBrandLogoUploadUrl });

  const handleFile = async (file: File): Promise<void> => {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_SIZE_BYTES) {
      setState({ kind: 'error', message: t('coverRejected') });
      return;
    }
    setState({ kind: 'busy' });
    const res = await urlMutation.mutateAsync({ contentType: file.type, sizeBytes: file.size });
    if (!res.ok || !res.data) {
      setState({ kind: 'error', message: t('coverUploadFailed') });
      return;
    }
    try {
      // SigV4 signed the content type and length: the PUT must repeat them exactly.
      const put = await fetch(res.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
        signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
      });
      if (!put.ok) throw new Error('upload rejected');
    } catch {
      setState({ kind: 'error', message: t('coverUploadFailed') });
      return;
    }
    setState({ kind: 'idle' });
    onUploaded(res.data.s3Key, URL.createObjectURL(file));
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span className="bg-muted ring-border grid aspect-[16/9] w-full max-w-xs shrink-0 place-items-center overflow-hidden rounded-xl ring-1">
        {coverUrl === null ? (
          <ImageIcon className="text-muted-foreground size-7" />
        ) : (
          <img src={coverUrl} alt="" className="size-full object-cover" />
        )}
      </span>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.kind === 'busy'}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            {state.kind === 'busy' ? t('coverUploading') : t('coverChoose')}
          </Button>
          {coverUrl === null ? null : (
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onCleared}>
              <Trash2 className="size-4" />
              {t('coverRemove')}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{t('coverHint')}</p>
        {state.kind === 'error' ? (
          <p className="text-destructive text-xs">{state.message}</p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
