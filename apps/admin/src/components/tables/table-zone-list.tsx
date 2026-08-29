import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { hasPermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import {
  addTablesMutation,
  archiveTableMutation,
  archiveTableZoneMutation,
  friendlyTableError,
  MAX_TABLES_PER_BULK_CALL,
  renameTableMutation,
  renameTableZoneMutation,
  type ProblemDetails,
  type TableView,
  type TableZoneView,
} from '@/lib/queries/table-zones';
import { printTablesSheet } from '@/lib/qr/print-tables-sheet';
import { downloadTableSvg } from '@/lib/qr/download-table-svg';

export interface TableZoneListProps {
  readonly zones: readonly TableZoneView[];
  readonly locationId: string;
}

export function TableZoneList({ zones, locationId }: TableZoneListProps): React.ReactElement {
  const { data: meResult } = useQuery(meQuery());
  const me = meResult?.data ?? null;
  const canUpdate = hasPermission(me, 'table', 'update');

  return (
    <div className="flex flex-col gap-4">
      {zones.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} locationId={locationId} canUpdate={canUpdate} />
      ))}
    </div>
  );
}

/**
 * The mutation's failure sentence is rendered here (in addition to the toast), inside whichever
 * dialog is open — a page-level banner sits behind Radix's `aria-hidden` background mask while a
 * dialog is open and would be invisible to assistive tech and to the operator's focus alike.
 */
function DialogError({ message }: { readonly message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

interface ZoneCardProps {
  readonly zone: TableZoneView;
  readonly locationId: string;
  readonly canUpdate: boolean;
}

function ZoneCard({ zone, locationId, canUpdate }: ZoneCardProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const queryClient = useQueryClient();
  const zoneQueryKey = ['tenancy', 'table-zones', locationId];

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(zone.name);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [addTablesOpen, setAddTablesOpen] = React.useState(false);
  const [addTablesCount, setAddTablesCount] = React.useState('1');
  const [addTablesError, setAddTablesError] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [printing, setPrinting] = React.useState(false);

  const activeTableCount = zone.tables.filter((table) => table.status === 'active').length;

  const renameMutation = useMutation({
    mutationFn: () => renameTableZoneMutation(locationId, zone.id, renameValue.trim()),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setRenameError(message);
        return;
      }
      showSuccess(t('renameZoneSuccess'));
      void queryClient.invalidateQueries({ queryKey: zoneQueryKey });
      setRenameOpen(false);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setRenameError(t('errors.generic'));
    },
  });

  const addTablesCountNumber = Number(addTablesCount);
  const isAddCountValid =
    Number.isInteger(addTablesCountNumber) &&
    addTablesCountNumber >= 1 &&
    addTablesCountNumber <= MAX_TABLES_PER_BULK_CALL;

  const addTablesMutationState = useMutation({
    mutationFn: () => addTablesMutation(locationId, zone.id, addTablesCountNumber),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setAddTablesError(message);
        return;
      }
      showSuccess(t('addTablesSuccess'));
      void queryClient.invalidateQueries({ queryKey: zoneQueryKey });
      setAddTablesOpen(false);
      setAddTablesCount('1');
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setAddTablesError(t('errors.generic'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveTableZoneMutation(locationId, zone.id),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setArchiveError(message);
        return;
      }
      showSuccess(t('archiveZoneSuccess'));
      void queryClient.invalidateQueries({ queryKey: zoneQueryKey });
      setArchiveOpen(false);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setArchiveError(t('errors.generic'));
    },
  });

  const handlePrint = (): void => {
    setPrinting(true);
    void printTablesSheet({
      zoneName: zone.name,
      tables: zone.tables.map((table) => ({
        tableId: table.id,
        number: table.number,
        ordinal: table.ordinal,
        qrUrl: table.qrUrl,
        status: table.status,
      })),
    }).finally(() => {
      setPrinting(false);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{zone.name}</CardTitle>
        <CardDescription>
          {zone.status === 'archived' ? t('statusArchived') : t('statusActive')}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={printing || activeTableCount === 0}
            onClick={handlePrint}
          >
            {printing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            {t('printAction')}
          </Button>
          {canUpdate ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenameValue(zone.name);
                  setRenameError(null);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="size-4" />
                {t('renameZoneAction')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddTablesError(null);
                  setAddTablesOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t('addTablesAction')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  setArchiveError(null);
                  setArchiveOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                {t('archiveZoneAction')}
              </Button>
            </>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">{t('printOrderingLine')}</p>
        <p className="text-muted-foreground text-sm">{t('printVerifyLine')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('tableNumberHeader')}</TableHead>
              <TableHead>{t('tableStatusHeader')}</TableHead>
              <TableHead className="text-right">{t('tableActionsHeader')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zone.tables.map((table) => (
              <TableRowItem
                key={table.id}
                table={table}
                zoneId={zone.id}
                locationId={locationId}
                canUpdate={canUpdate}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameZoneDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`rename-zone-${zone.id}`}>{t('zoneNameLabel')}</Label>
            <Input
              id={`rename-zone-${zone.id}`}
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
              }}
            />
          </div>
          <DialogError message={renameError} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameOpen(false);
              }}
            >
              {t('cancelAction')}
            </Button>
            <Button
              disabled={renameValue.trim().length === 0 || renameMutation.isPending}
              onClick={() => {
                renameMutation.mutate();
              }}
            >
              {t('renameZoneSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTablesOpen} onOpenChange={setAddTablesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addTablesDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`add-tables-${zone.id}`}>{t('addTablesCountLabel')}</Label>
            <Input
              id={`add-tables-${zone.id}`}
              type="number"
              min={1}
              max={MAX_TABLES_PER_BULK_CALL}
              value={addTablesCount}
              onChange={(e) => {
                setAddTablesCount(e.target.value);
              }}
            />
            {!isAddCountValid ? (
              <p className="text-destructive text-sm">
                {t('tableCountHint', { max: MAX_TABLES_PER_BULK_CALL })}
              </p>
            ) : null}
          </div>
          <DialogError message={addTablesError} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddTablesOpen(false);
              }}
            >
              {t('cancelAction')}
            </Button>
            <Button
              disabled={!isAddCountValid || addTablesMutationState.isPending}
              onClick={() => {
                addTablesMutationState.mutate();
              }}
            >
              {t('addTablesSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('archiveZoneConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('archiveZoneConfirmDescription', { count: activeTableCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogError message={archiveError} />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelAction')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                archiveMutation.mutate();
              }}
            >
              {t('archiveZoneConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface TableRowItemProps {
  readonly table: TableView;
  readonly zoneId: string;
  readonly locationId: string;
  readonly canUpdate: boolean;
}

function TableRowItem({
  table,
  zoneId,
  locationId,
  canUpdate,
}: TableRowItemProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const queryClient = useQueryClient();
  const zoneQueryKey = ['tenancy', 'table-zones', locationId];

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(table.number);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);

  const renameMutation = useMutation({
    mutationFn: () => renameTableMutation(locationId, zoneId, table.id, renameValue.trim()),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null, {
          attemptedNumber: renameValue.trim(),
        });
        showError(message);
        setRenameError(message);
        return;
      }
      showSuccess(t('renameTableSuccess'));
      void queryClient.invalidateQueries({ queryKey: zoneQueryKey });
      setRenameOpen(false);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setRenameError(t('errors.generic'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveTableMutation(locationId, zoneId, table.id),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setArchiveError(message);
        return;
      }
      showSuccess(t('archiveTableSuccess'));
      void queryClient.invalidateQueries({ queryKey: zoneQueryKey });
      setArchiveOpen(false);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setArchiveError(t('errors.generic'));
    },
  });

  const handleDownload = (): void => {
    setDownloading(true);
    void downloadTableSvg({ number: table.number, qrUrl: table.qrUrl }).finally(() => {
      setDownloading(false);
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{table.number}</TableCell>
      <TableCell>
        <Badge variant={table.status === 'archived' ? 'secondary' : 'default'}>
          {table.status === 'archived' ? t('statusArchived') : t('statusActive')}
        </Badge>
      </TableCell>
      <TableCell className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={downloading} onClick={handleDownload}>
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {t('downloadAction')}
        </Button>
        {canUpdate ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRenameValue(table.number);
                setRenameError(null);
                setRenameOpen(true);
              }}
            >
              <Pencil className="size-4" />
              {t('renameTableAction')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setArchiveError(null);
                setArchiveOpen(true);
              }}
            >
              <Trash2 className="size-4" />
              {t('archiveTableAction')}
            </Button>
          </>
        ) : null}

        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('renameTableDialogTitle')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={`rename-table-${table.id}`}>{t('renameTableLabel')}</Label>
              <Input
                id={`rename-table-${table.id}`}
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                }}
              />
            </div>
            <DialogError message={renameError} />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRenameOpen(false);
                }}
              >
                {t('cancelAction')}
              </Button>
              <Button
                disabled={renameValue.trim().length === 0 || renameMutation.isPending}
                onClick={() => {
                  renameMutation.mutate();
                }}
              >
                {t('renameTableSubmit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('archiveTableConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('archiveTableConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <DialogError message={archiveError} />
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancelAction')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  archiveMutation.mutate();
                }}
              >
                {t('archiveTableConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
