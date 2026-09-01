import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@resto/ui';

export interface DocumentSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly body: string;
}

/** A document the venue publishes, read where the guest asked for it rather than on a new page. */
export const DocumentSheet = ({ open, onOpenChange, title, body }: DocumentSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
    >
      <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
      <SheetHeader className="px-5 pt-4 pb-0">
        <SheetTitle className="text-2xl font-extrabold">{title}</SheetTitle>
      </SheetHeader>
      <div className="px-5 pt-4 pb-8">
        <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{body}</p>
      </div>
    </SheetContent>
  </Sheet>
);
