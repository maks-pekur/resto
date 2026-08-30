import type { ComponentType } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface FilterTabItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly tone?: 'default' | 'destructive';
}

export interface FilterTabsProps<T extends string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly items: readonly FilterTabItem<T>[];
  readonly className?: string;
  readonly stretch?: boolean;
}

/**
 * The one tab strip every filter bar uses. It carries no surface of its own — the active tab is
 * painted against the bar behind it, which is why the height comes from the row, not from here.
 * `group-data-[orientation=horizontal]/tabs:h-full` is load-bearing: the shadcn list pins its own
 * height with that same variant and a plain `h-full` loses to it on specificity.
 */
export function FilterTabs<T extends string>({
  value,
  onChange,
  items,
  className,
  stretch = false,
}: FilterTabsProps<T>) {
  return (
    <Tabs
      className="h-full gap-0"
      value={value}
      onValueChange={(next) => {
        onChange(next as T);
      }}
    >
      <TabsList
        className={cn(
          'h-full gap-0 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-full',
          stretch && 'w-full justify-start overflow-x-auto [&::-webkit-scrollbar]:hidden',
          className,
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                'h-full min-h-full gap-1.5 rounded-none border-0 px-4 data-[state=active]:bg-muted data-[state=active]:shadow-none dark:data-[state=active]:border-0 dark:data-[state=active]:bg-muted',
                item.tone === 'destructive' && 'text-destructive',
              )}
            >
              {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
              {item.label}
              {item.count === undefined ? null : (
                <span
                  className={cn(
                    'tabular-nums',
                    item.tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {item.count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
