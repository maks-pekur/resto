import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@resto/ui';
import type { ResolvedTable } from '../api/client';
import { t } from '../i18n';
import { TableScanCard } from './TableScanCard';

export interface TableProblemSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSeated: (table: ResolvedTable) => void;
  /** Why the guest is looking at this: a code that would not read, or an order with no table. */
  readonly reason: 'unreadable' | 'ordering';
}

/**
 * A code that did not resolve is not a line of text to read past — it is the one thing standing
 * between the guest and an order, so it arrives as a sheet with the camera already open.
 */
export const TableProblemSheet = ({
  open,
  onOpenChange,
  onSeated,
  reason,
}: TableProblemSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
    >
      <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
      <SheetHeader className="items-center px-5 pt-4 pb-2 text-center">
        <span aria-hidden className="text-5xl">
          🙈
        </span>
        <SheetTitle className="text-center">{t(`table.${reason}Title`)}</SheetTitle>
      </SheetHeader>

      <div className="px-5 pb-6">
        <TableScanCard
          autoStart
          body={t(`table.${reason}Body`)}
          onSeated={(table) => {
            onOpenChange(false);
            onSeated(table);
          }}
        />
      </div>
    </SheetContent>
  </Sheet>
);
