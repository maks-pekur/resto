'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ModifierGroupRow {
  readonly id: string;
  readonly name: string;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly optionCount: number;
  readonly usageCount: number;
}

export interface ModifierGroupsTableClientProps {
  readonly items: readonly ModifierGroupRow[];
}

const formatMinMax = (min: number, max: number): string => {
  if (max === 0) return `${min.toString()}–∞`;
  return `${min.toString()}–${max.toString()}`;
};

export function ModifierGroupsTableClient({
  items,
}: ModifierGroupsTableClientProps): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead className="w-[100px]">Мин / Макс</TableHead>
          <TableHead className="w-[120px]">Вариантов</TableHead>
          <TableHead className="w-[160px]">Используется в</TableHead>
          <TableHead className="w-[60px] text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id} className="h-12" data-testid={`mg-row-${row.id}`}>
            <TableCell className="font-medium">
              <Link href={`/dashboard/menu/modifier-groups/${row.id}`} className="hover:underline">
                {row.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatMinMax(row.minSelectable, row.maxSelectable)}
            </TableCell>
            <TableCell className="text-muted-foreground">{row.optionCount}</TableCell>
            <TableCell className="text-muted-foreground">{row.usageCount}</TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Действия">
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/menu/modifier-groups/${row.id}`}>Открыть</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
