import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

const TOTP_CODE_PATTERN = /^\d{6}$/u;

type Phase =
  | { kind: 'idle' }
  | { kind: 'password-enable'; pending: boolean; error: string | null }
  | {
      kind: 'showing-codes';
      totpURI: string;
      backupCodes: readonly string[];
      checkboxChecked: boolean;
      totpInput: string;
      verifyPending: boolean;
      verifyError: string | null;
    }
  | { kind: 'password-disable'; pending: boolean; error: string | null };

const friendlyEnableError = (error: 'invalid_password' | 'session_expired' | 'unknown'): string => {
  if (error === 'invalid_password') return 'That password did not match. Try again.';
  if (error === 'session_expired') return 'Your session expired. Sign in again and retry.';
  return 'Something went wrong. Please try again in a moment.';
};

const friendlyVerifyError = (error: 'invalid_code' | 'session_expired' | 'unknown'): string => {
  if (error === 'invalid_code')
    return 'Invalid code. Open your authenticator and try the current code.';
  if (error === 'session_expired') return 'Your session expired. Sign in again and retry.';
  return 'Something went wrong. Please try again in a moment.';
};

const friendlyDisableError = (
  error: 'invalid_password' | 'session_expired' | 'unknown',
): string => {
  if (error === 'invalid_password') return 'That password did not match. Try again.';
  if (error === 'session_expired') return 'Your session expired. Sign in again and retry.';
  return 'Something went wrong. Please try again in a moment.';
};

export interface TwoFactorSectionProps {
  readonly twoFactorEnabled: boolean;
}

export function TwoFactorSection({ twoFactorEnabled }: TwoFactorSectionProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const reloadOnSuccess = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  const onEnableSubmit = (password: string): void => {
    setPhase({ kind: 'password-enable', pending: true, error: null });
    void (async () => {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error) {
        const errorType =
          res.error.status === 401
            ? 'invalid_password'
            : res.error.status === 403
              ? 'session_expired'
              : 'unknown';
        setPhase({
          kind: 'password-enable',
          pending: false,
          error: friendlyEnableError(errorType),
        });
        return;
      }
      const data = res.data as { totpURI?: string; backupCodes?: string[] } | null;
      if (!data?.totpURI || !data.backupCodes?.length) {
        setPhase({
          kind: 'password-enable',
          pending: false,
          error: friendlyEnableError('unknown'),
        });
        return;
      }
      setPhase({
        kind: 'showing-codes',
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
        checkboxChecked: false,
        totpInput: '',
        verifyPending: false,
        verifyError: null,
      });
    })();
  };

  const onConfirm = (): void => {
    if (phase.kind !== 'showing-codes') return;
    if (!phase.checkboxChecked || !TOTP_CODE_PATTERN.test(phase.totpInput)) return;
    const code = phase.totpInput;
    setPhase({ ...phase, verifyPending: true, verifyError: null });
    void (async () => {
      const res = await authClient.twoFactor.verifyTotp({ code });
      if (res.error) {
        const errorType =
          res.error.status === 403
            ? 'session_expired'
            : res.error.status >= 400 && res.error.status < 500
              ? 'invalid_code'
              : 'unknown';
        setPhase((p) =>
          p.kind === 'showing-codes'
            ? { ...p, verifyPending: false, verifyError: friendlyVerifyError(errorType) }
            : p,
        );
        return;
      }
      reloadOnSuccess();
    })();
  };

  const onDisableSubmit = (password: string): void => {
    setPhase({ kind: 'password-disable', pending: true, error: null });
    void (async () => {
      const res = await authClient.twoFactor.disable({ password });
      if (res.error) {
        const errorType =
          res.error.status === 401
            ? 'invalid_password'
            : res.error.status === 403
              ? 'session_expired'
              : 'unknown';
        setPhase({
          kind: 'password-disable',
          pending: false,
          error: friendlyDisableError(errorType),
        });
        return;
      }
      reloadOnSuccess();
    })();
  };

  const onAnyDialogOpenChange = (open: boolean): void => {
    if (!open) setPhase({ kind: 'idle' });
  };

  const confirmEnabled =
    phase.kind === 'showing-codes' &&
    phase.checkboxChecked &&
    TOTP_CODE_PATTERN.test(phase.totpInput) &&
    !phase.verifyPending;

  return (
    <section className="bg-card space-y-4 rounded-lg border p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Two-factor authentication</h2>
          <p className="text-muted-foreground text-sm">
            {twoFactorEnabled
              ? 'Two-factor authentication active. Your account requires a 6-digit code at sign-in.'
              : 'Add an authenticator app to require a 6-digit code at sign-in. Strongly recommended for accounts that own a tenant.'}
          </p>
        </div>
      </div>

      {twoFactorEnabled ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm space-y-2">
          <p className="font-medium">Two-factor authentication active</p>
          <p className="text-muted-foreground">
            Lost your device and recovery codes? Contact founder support — recovery is a manual
            runbook for the first 100 customers and admin-side reset is not available in this
            release.
          </p>
          <div className="pt-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setPhase({ kind: 'password-disable', pending: false, error: null });
              }}
            >
              Disable 2FA
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => {
            setPhase({ kind: 'password-enable', pending: false, error: null });
          }}
        >
          Enable 2FA
        </Button>
      )}

      <AlertDialog
        open={phase.kind === 'password-enable' || phase.kind === 'password-disable'}
        onOpenChange={onAnyDialogOpenChange}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {phase.kind === 'password-disable' ? 'Disable 2FA' : 'Confirm your password'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {phase.kind === 'password-disable'
                ? 'Confirm your current password to disable two-factor authentication.'
                : 'Re-enter your current password to start the 2FA setup.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const raw = fd.get('password');
              const pw = typeof raw === 'string' ? raw : '';
              if (phase.kind === 'password-disable') onDisableSubmit(pw);
              else onEnableSubmit(pw);
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="tfa-current-password">Current password</Label>
              <Input
                id="tfa-current-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {(phase.kind === 'password-enable' || phase.kind === 'password-disable') &&
            phase.error ? (
              <p role="alert" className="text-destructive text-sm">
                {phase.error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPhase({ kind: 'idle' });
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  (phase.kind === 'password-enable' || phase.kind === 'password-disable') &&
                  phase.pending
                }
              >
                {(phase.kind === 'password-enable' || phase.kind === 'password-disable') &&
                phase.pending
                  ? 'Working…'
                  : 'Continue'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={phase.kind === 'showing-codes'} onOpenChange={onAnyDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your recovery codes</AlertDialogTitle>
            <AlertDialogDescription>
              Scan the QR code below with your authenticator app, save the 10 recovery codes
              somewhere safe, then enter the current 6-digit code to activate two-factor
              authentication.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {phase.kind === 'showing-codes' ? (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  TOTP setup URI
                </p>
                <code className="block break-all rounded-md border bg-muted/40 p-2 text-xs">
                  {phase.totpURI}
                </code>
                <p className="text-muted-foreground text-xs">
                  Paste this URI into your authenticator app (or render a QR code from it). The
                  secret is embedded in the URI.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Recovery codes (shown once)
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(phase.backupCodes.join('\n'));
                    }}
                  >
                    Copy all
                  </Button>
                </div>
                <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {phase.backupCodes.map((c) => (
                    <li key={c} className="rounded-sm border bg-muted/40 px-2 py-1">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="tfa-saved"
                  type="checkbox"
                  className="mt-1"
                  checked={phase.checkboxChecked}
                  onChange={() => {
                    setPhase((p) =>
                      p.kind === 'showing-codes'
                        ? { ...p, checkboxChecked: !p.checkboxChecked }
                        : p,
                    );
                  }}
                />
                <Label htmlFor="tfa-saved" className="text-sm leading-snug">
                  I have saved these recovery codes somewhere I can recover them if I lose my
                  device.
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tfa-totp">6-digit code from your authenticator</Label>
                <Input
                  id="tfa-totp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={phase.totpInput}
                  onChange={(e) => {
                    setPhase((p) =>
                      p.kind === 'showing-codes'
                        ? {
                            ...p,
                            totpInput: e.currentTarget.value.replace(/\D/gu, '').slice(0, 6),
                          }
                        : p,
                    );
                  }}
                />
              </div>

              {phase.verifyError ? (
                <p role="alert" className="text-destructive text-sm">
                  {phase.verifyError}
                </p>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPhase({ kind: 'idle' });
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!confirmEnabled} onClick={onConfirm}>
              {phase.kind === 'showing-codes' && phase.verifyPending ? 'Verifying…' : 'Confirm'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
