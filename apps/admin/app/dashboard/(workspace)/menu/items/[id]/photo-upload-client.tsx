'use client';

import * as React from 'react';
import { ImageIcon } from 'lucide-react';

export interface PhotoUploadClientProps {
  readonly itemId: string;
  readonly currentS3Key: string | null;
  readonly currentPhotoUrl?: string | null;
  readonly onUploaded: (s3Key: string) => void;
}

// Task 4 of Plan 04b-07 replaces this scaffold with the full presigned-PUT flow.
export function PhotoUploadClient(_: PhotoUploadClientProps): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled="true"
      className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/40 text-muted-foreground"
    >
      <ImageIcon className="size-6" aria-hidden="true" />
      <span className="text-sm">Загрузка фото — в Task 4</span>
    </div>
  );
}
