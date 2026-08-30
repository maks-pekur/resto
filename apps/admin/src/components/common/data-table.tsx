import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn {
  readonly label: string;
  readonly className?: string;
  /** For the actions column, whose heading is for screen readers only. */
  readonly srOnly?: boolean;
}

/** The one table look in the admin: a bordered card, a muted header row, hairline rows. */
export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-md border', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ columns }: { columns: readonly DataTableColumn[] }) {
  return (
    <thead>
      <tr className="bg-muted/50 border-b">
        {columns.map((column) => (
          <th
            key={column.label}
            scope="col"
            className={cn('px-4 py-2 text-left font-medium', column.className)}
          >
            <span className={column.srOnly === true ? 'sr-only' : undefined}>{column.label}</span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function DataTableHeadCell({ children, className, ...props }: ComponentProps<'th'>) {
  return (
    <th scope="col" className={cn('px-4 py-2 text-left font-medium', className)} {...props}>
      {children}
    </th>
  );
}

export function DataTableHeaderRow({ children, className, ...props }: ComponentProps<'tr'>) {
  return (
    <thead>
      <tr className={cn('bg-muted/50 border-b', className)} {...props}>
        {children}
      </tr>
    </thead>
  );
}

export function DataTableBody({ children, ...props }: ComponentProps<'tbody'>) {
  return <tbody {...props}>{children}</tbody>;
}

export function DataTableRow({ children, className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('border-b last:border-0', className)} {...props}>
      {children}
    </tr>
  );
}

export function DataTableCell({ children, className, ...props }: ComponentProps<'td'>) {
  return (
    <td className={cn('px-4 py-2 align-middle', className)} {...props}>
      {children}
    </td>
  );
}
