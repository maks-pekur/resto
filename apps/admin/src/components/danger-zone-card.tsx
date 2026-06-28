import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  scheduleOffboard,
  cancelOffboard,
  friendlyOffboardError,
  type ProblemDetails,
} from '@/lib/queries/tenancy';

const COOL_OFF_DAYS = 30;

interface Tenant {
  slug: string;
  status: string;
  offboardingScheduledAt: string | null;
}

const formatCoolOffRemaining = (scheduledAt: string): string => {
  const expiry = new Date(scheduledAt).getTime() + COOL_OFF_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = expiry - Date.now();
  if (remainingMs <= 0) return 'cool-off expired';
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return `${days.toString()} day${days === 1 ? '' : 's'} until cool-off ends`;
};

export function DangerZoneCard({
  tenant,
  isOwner,
  userId,
}: {
  tenant: Tenant;
  isOwner: boolean;
  userId: string;
}) {
  const [confirmInput, setConfirmInput] = useState('');
  const qc = useQueryClient();

  const onSettled = () => void qc.invalidateQueries({ queryKey: ['tenancy', 'me'] });

  const scheduleMutation = useMutation({
    mutationFn: () => scheduleOffboard(userId),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyOffboardError(res.status, res.data as ProblemDetails | null));
      } else {
        toast.success('Offboarding scheduled. Cool-off ends in 30 days.');
      }
      setConfirmInput('');
    },
    onError: () => toast.error('Request failed. Please try again.'),
    onSettled,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOffboard(),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyOffboardError(res.status, res.data as ProblemDetails | null));
      } else {
        toast.success('Offboarding cancelled. Tenant is active again.');
      }
    },
    onError: () => toast.error('Request failed. Please try again.'),
    onSettled,
  });

  if (!isOwner) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Only the tenant owner can manage offboarding. Contact your owner to proceed.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (tenant.status === 'erased') {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Tenant erased</CardTitle>
          <CardDescription>
            This tenant has been permanently erased. No further actions are available.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (tenant.status === 'pending_offboarding') {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Offboarding scheduled</CardTitle>
          <CardDescription>
            All API access is blocked.{' '}
            {tenant.offboardingScheduledAt
              ? formatCoolOffRemaining(tenant.offboardingScheduledAt)
              : 'cool-off in progress'}
            . Cancel below to restore the tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => { cancelMutation.mutate(); }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? 'Cancelling…' : 'Cancel offboarding'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (tenant.status !== 'active') {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Tenant is {tenant.status}</CardTitle>
          <CardDescription>
            Offboarding is unavailable while the tenant is in this state.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Schedule offboarding to begin a 30-day cool-off period. After the cool-off, the tenant and
          all its data will be permanently erased. You can cancel during the cool-off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={scheduleMutation.isPending}>
              Schedule offboarding
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm offboarding</AlertDialogTitle>
              <AlertDialogDescription>
                This blocks all tenant traffic immediately and starts a 30-day cool-off. After 30
                days, all data is permanently and irreversibly erased.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="confirm-slug">
                Type <span className="font-mono font-semibold">{tenant.slug}</span> to confirm
              </Label>
              <Input
                id="confirm-slug"
                value={confirmInput}
                onChange={(e) => { setConfirmInput(e.target.value); }}
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setConfirmInput(''); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmInput !== tenant.slug || scheduleMutation.isPending}
                onClick={() => { scheduleMutation.mutate(); }}
              >
                {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule offboarding'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
