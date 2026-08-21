import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  readonly label: string;
  readonly caption: string;
  readonly done: boolean;
}

export function SetupChecklistCard() {
  const items: ChecklistItem[] = [
    // The protected layout only ever renders this page once the tenant
    // exists and is past `pending_setup` (D-31) — "restaurant set up" is
    // unconditionally true by the time this checklist can render.
    { label: 'Account created', caption: 'Welcome', done: true },
    { label: 'Restaurant set up', caption: 'Done', done: true },
    { label: 'Catalog', caption: 'Coming in Phase 4', done: false },
    { label: 'Customer site', caption: 'Coming in Phase 5', done: false },
    { label: 'Accepting orders', caption: 'Coming in Phase 7', done: false },
    { label: 'Payments (Stripe Connect)', caption: 'Coming in Phase 8', done: false },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup Checklist</CardTitle>
        <CardDescription>
          Your turnkey digital presence — here&apos;s what&apos;s coming next.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              {item.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className={cn('flex-1', item.done ? '' : 'text-muted-foreground')}>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs">{item.caption}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
