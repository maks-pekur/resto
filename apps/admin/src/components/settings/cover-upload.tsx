import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, Trash2, Plus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { COVER_MAX } from '@resto/domain';
import { Button } from '@/components/ui/button';
import { getBrandLogoUploadUrl } from '@/lib/queries/tenancy';

const ALLOWED_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const PUT_TIMEOUT_MS = 60_000;

export interface CoverUploadProps {
  /** Published URLs and freshly uploaded keys in one list — the order the guest will swipe. */
  readonly photos: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'error'; readonly message: string };

export function CoverUpload({ photos, onChange }: CoverUploadProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.brand' });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const [previews, setPreviews] = React.useState<Readonly<Record<string, string>>>({});

  const urlMutation = useMutation({ mutationFn: getBrandLogoUploadUrl });

  const room = COVER_MAX - photos.length;

  const handleFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length > room) {
      setState({ kind: 'error', message: t('coverTooMany', { max: COVER_MAX }) });
      return;
    }
    if (files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_SIZE_BYTES)) {
      setState({ kind: 'error', message: t('coverRejected') });
      return;
    }

    setState({ kind: 'busy' });
    const added: string[] = [];
    const shots: Record<string, string> = {};
    try {
      for (const file of files) {
        const res = await urlMutation.mutateAsync({
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!res.ok || res.data === null) throw new Error('upload url');
        const { uploadUrl, s3Key } = res.data;
        const put = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'content-type': file.type },
          signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
        });
        if (!put.ok) throw new Error('upload');
        added.push(s3Key);
        shots[s3Key] = URL.createObjectURL(file);
      }
      setPreviews((prev) => ({ ...prev, ...shots }));
      onChange([...photos, ...added]);
      setState({ kind: 'idle' });
    } catch {
      setState({ kind: 'error', message: t('coverUploadFailed') });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <li key={photo} className="group relative">
            <span className="bg-muted ring-border grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-xl ring-1">
              <img src={previews[photo] ?? photo} alt="" className="size-full object-cover" />
            </span>
            {index === 0 ? (
              <span className="bg-background/90 absolute start-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                {t('coverPrimary')}
              </span>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={t('coverRemove')}
              className="absolute end-1.5 top-1.5 size-7"
              onClick={() => {
                onChange(photos.filter((entry) => entry !== photo));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}

        {room > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={state.kind === 'busy'}
              className="text-muted-foreground hover:bg-muted ring-border flex aspect-[16/9] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-xs ring-1 ring-dashed disabled:opacity-60"
            >
              {state.kind === 'busy' ? (
                <ImageIcon className="size-5 animate-pulse" />
              ) : (
                <Plus className="size-5" />
              )}
              {state.kind === 'busy' ? t('coverUploading') : t('coverChoose')}
            </button>
          </li>
        ) : null}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void handleFiles(files);
        }}
      />

      <p className="text-muted-foreground text-xs">{t('coverHint', { max: COVER_MAX })}</p>
      {state.kind === 'error' ? <p className="text-destructive text-xs">{state.message}</p> : null}
    </div>
  );
}
