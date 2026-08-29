import type { ReactNode } from 'react';

export interface GuestShellProps {
  readonly header: ReactNode;
  readonly rail?: ReactNode;
  readonly banner?: ReactNode;
  readonly footer: ReactNode;
  readonly bar?: ReactNode;
  readonly children: ReactNode;
}

export const GuestShell = ({ header, rail, banner, footer, bar, children }: GuestShellProps) => (
  <div className="flex min-h-dvh flex-col">
    {header}
    {rail}
    {banner}
    <main className="flex-1">{children}</main>
    {footer}
    {bar}
  </div>
);
