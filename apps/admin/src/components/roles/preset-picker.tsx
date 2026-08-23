import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Preset {
  readonly slug: string;
  readonly nameEn: string;
  readonly description: string;
  readonly permission: Record<string, string[]>;
}

const PRESETS: readonly Preset[] = [
  {
    slug: 'manager',
    nameEn: 'Manager (Менеджер)',
    description: 'Full operational access: menu, orders, staff invitations, reports, and settings.',
    permission: {
      menu: ['read', 'create', 'update', 'delete'],
      order: ['read', 'update-status'],
      staff: ['invite'],
      reports: ['read'],
      settings: ['update'],
    },
  },
  {
    slug: 'cashier-foh',
    nameEn: 'Cashier — Front of House (Кассир-зал)',
    description: 'View menu and manage orders at the front of house.',
    permission: {
      order: ['read', 'update-status'],
      menu: ['read'],
    },
  },
  {
    slug: 'kitchen',
    nameEn: 'Kitchen (Кухня)',
    description: 'View and update order status from the kitchen.',
    permission: {
      order: ['read', 'update-status'],
    },
  },
];

interface PresetPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (preset: { name: string; permission: Record<string, string[]> }) => void;
}

export function PresetPicker({ open, onOpenChange, onSelect }: PresetPickerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Start from a preset</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          {PRESETS.map((preset) => (
            <Card key={preset.slug}>
              <CardHeader>
                <CardTitle className="text-base">{preset.nameEn}</CardTitle>
                <CardDescription>{preset.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onSelect({ name: preset.slug, permission: preset.permission });
                    onOpenChange(false);
                  }}
                >
                  Use this preset
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
