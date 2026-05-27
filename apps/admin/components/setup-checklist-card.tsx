import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  readonly label: string;
  readonly caption: string;
  readonly done: boolean;
}

export interface SetupChecklistCardProps {
  readonly brandsCount: number;
}

/**
 * Setup Checklist card — 6 MVP-1 milestones per CONTEXT D-12 (verbatim
 * item list + order). Items 1 (account) and 2 (brand set up) tick when
 * their condition is met; items 3-6 stay pending with a Phase-X caption.
 * D-08 voice rule: calm, operator-respectful, no exclamation marks.
 */
export function SetupChecklistCard({ brandsCount }: SetupChecklistCardProps) {
  const items: ChecklistItem[] = [
    { label: 'Account created', caption: 'Welcome', done: true },
    {
      label: 'Brand set up',
      caption: brandsCount >= 1 ? 'Done' : 'Add your first brand',
      done: brandsCount >= 1,
    },
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
