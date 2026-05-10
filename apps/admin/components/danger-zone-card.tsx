'use client';

import { useState, useTransition } from 'react';
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
import { toast } from 'sonner';
import {
  scheduleOffboardingAction,
  cancelOffboardingAction,
} from '@/app/dashboard/(workspace)/settings/actions';

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

export const DangerZoneCard = ({ tenant, isOwner }: { tenant: Tenant; isOwner: boolean }) => {
  const [confirmInput, setConfirmInput] = useState('');
  const [pending, startTransition] = useTransition();

  const onSchedule = () => {
    startTransition(async () => {
      const result = await scheduleOffboardingAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setConfirmInput('');
    });
  };

  const onCancel = () => {
    startTransition(async () => {
      const result = await cancelOffboardingAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  };

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
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {pending ? 'Cancelling…' : 'Cancel offboarding'}
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
            <Button variant="destructive" disabled={pending}>
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
                onChange={(e) => {
                  setConfirmInput(e.target.value);
                }}
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setConfirmInput('');
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmInput !== tenant.slug || pending}
                onClick={onSchedule}
              >
                {pending ? 'Scheduling…' : 'Schedule offboarding'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
