import { SidebarTrigger } from '@/components/ui/sidebar';
import { NavUser } from '@/components/nav-user';
import type { OperatorSummary } from '@/lib/queries/identity';

export function SiteHeader({ operator }: { operator: OperatorSummary }) {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div className="ml-auto flex items-center gap-2">
          <NavUser operator={operator} />
        </div>
      </div>
    </header>
  );
}
