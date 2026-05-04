'use client';

import { useEffect, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

const fetchTenant = async (signal: AbortSignal): Promise<TenantSummary | null> => {
  const res = await fetch('/v1/tenants/me', {
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as TenantSummary;
};

export function TenantBreadcrumb({ trail }: { trail: string }) {
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchTenant(controller.signal);
        setTenant(result);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="font-medium" data-testid="tenant-display-name">
              {tenant?.displayName ?? 'Unknown tenant'}
            </span>
          )}
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{trail}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
