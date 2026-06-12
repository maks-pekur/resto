'use client';

import Image from 'next/image';
import { ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MenuBrandDto } from '@resto/api-client/public';

interface TenantHeaderProps {
  brand: MenuBrandDto | null;
  cartItemCount?: number;
  onOpenCart?: () => void;
}

export function TenantHeader({ brand, cartItemCount = 0, onOpenCart }: TenantHeaderProps) {
  const displayName = brand?.displayName ?? 'Restaurant';
  const logoUrl = brand?.theme?.logoUrl ?? null;

  return (
    <header className="sticky top-0 z-50 h-16 w-full border-b bg-[oklch(0.97_0_0)]">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={displayName}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : null}
          <span className="text-[28px] font-semibold leading-[1.1]">{displayName}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-11 w-11"
          onClick={onOpenCart}
          aria-label={
            cartItemCount > 0 ? `${cartItemCount.toString()} items in cart` : 'Your cart is empty'
          }
        >
          <ShoppingCart className="h-5 w-5" />
          {cartItemCount > 0 ? (
            <Badge
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary,#16a34a)] p-0 text-xs text-white"
              aria-hidden="true"
            >
              {cartItemCount}
            </Badge>
          ) : null}
        </Button>
      </div>
    </header>
  );
}
