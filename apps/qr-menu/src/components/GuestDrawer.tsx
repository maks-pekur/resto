import { Sheet, SheetContent, SheetHeader, SheetTitle, ChevronIcon } from '@resto/ui';
import type { ComponentType, ReactNode } from 'react';
import { t } from '../i18n';

export interface DrawerEntry {
  readonly id: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** Absent on a row that carries its own control — the control is what the guest presses. */
  readonly onSelect?: () => void;
  readonly trailing?: ReactNode;
}

export interface GuestDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tenantName: string;
  readonly entries: readonly DrawerEntry[];
}

/**
 * The side of the app the guest visits rarely: everything that is not the menu itself. It comes
 * from the left because the tab bar already owns the bottom edge and the cart the right.
 */
export const GuestDrawer = ({ open, onOpenChange, tenantName, entries }: GuestDrawerProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 p-0">
      <SheetHeader className="px-5 pt-5 pb-3">
        <SheetTitle className="text-xl font-extrabold">{tenantName}</SheetTitle>
      </SheetHeader>

      <nav
        aria-label={t('nav.label')}
        className="flex flex-col px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {entries.map((entry) =>
          entry.onSelect === undefined ? (
            <div
              key={entry.id}
              data-testid={`drawer-${entry.id}`}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold"
            >
              <entry.icon className="text-muted-foreground size-5 shrink-0" />
              <span className="flex-1">{entry.label}</span>
              {entry.trailing}
            </div>
          ) : (
            <button
              key={entry.id}
              type="button"
              data-testid={`drawer-${entry.id}`}
              onClick={() => {
                onOpenChange(false);
                entry.onSelect?.();
              }}
              className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-start text-base font-semibold transition-colors"
            >
              <entry.icon className="text-muted-foreground size-5 shrink-0" />
              <span className="flex-1">{entry.label}</span>
              <ChevronIcon className="text-muted-foreground size-4 shrink-0" />
            </button>
          ),
        )}
      </nav>
    </SheetContent>
  </Sheet>
);
