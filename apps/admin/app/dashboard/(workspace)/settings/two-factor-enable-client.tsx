'use client';

import { useState, useTransition } from 'react';
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
import {
  enableTwoFactorAction,
  verifyTwoFactorAction,
  disableTwoFactorAction,
} from './two-factor-actions';

/**
 * AUTH-07 / D-22 — 2FA TOTP enable flow with explicit "I saved them" gate.
 *
 * State machine:
 *   idle → password-confirm → showing-codes (BackupCodesDialog) → verifying →
 *   done (settings page reloads with twoFactorEnabled=true on next request).
 *
 * Pitfall 7: BA `skipVerificationOnEnable=false` default is preserved. The
 * enable() server action only generates the TOTP secret + 10 backup codes;
 * `user.twoFactorEnabled` flips to true only after a successful verify-totp
 * call. Closing the tab between enable() and verify() leaves the user in the
 * pre-2FA state — no lockout, no half-state, the codes that were just shown
 * are NOT valid for any sign-in flow (BA never persisted the activation).
 *
 * D-23 — explicit OUT of scope here:
 *  - NO admin-reset-for-subordinates UI (Phase 17 / TEAM-04).
 *  - NO recovery-code regeneration UI (Phase 17 / TEAM-05).
 *  - NO email-recovery loop (cancels the 2FA security gain).
 */

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
  const [, startTransition] = useTransition();

  // Reload-after-success: the server-rendered settings page reads
  // `twoFactorEnabled` from the api on every request, so we navigate to the
  // same URL (forces a full revalidation through Next's app-router refresh).
  // Using window.location.reload() avoids importing useRouter in test setup
  // and matches the prior session-bound enablement gesture: the user has
  // just satisfied the 2FA challenge in the BA flow.
  const reloadOnSuccess = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  const onEnableClick = (): void => {
    setPhase({ kind: 'password-enable', pending: false, error: null });
  };

  const onEnableSubmit = (password: string): void => {
    setPhase({ kind: 'password-enable', pending: true, error: null });
    startTransition(() => {
      void (async () => {
        const res = await enableTwoFactorAction(password);
        if (!res.ok) {
          setPhase({
            kind: 'password-enable',
            pending: false,
            error: friendlyEnableError(res.error),
          });
          return;
        }
        setPhase({
          kind: 'showing-codes',
          totpURI: res.totpURI,
          backupCodes: res.backupCodes,
          checkboxChecked: false,
          totpInput: '',
          verifyPending: false,
          verifyError: null,
        });
      })();
    });
  };

  const onCheckboxToggle = (): void => {
    setPhase((p) =>
      p.kind === 'showing-codes' ? { ...p, checkboxChecked: !p.checkboxChecked } : p,
    );
  };

  const onTotpInputChange = (value: string): void => {
    setPhase((p) => (p.kind === 'showing-codes' ? { ...p, totpInput: value } : p));
  };

  const onCopyCodes = (): void => {
    if (phase.kind !== 'showing-codes') return;
    void navigator.clipboard.writeText(phase.backupCodes.join('\n'));
  };

  const onConfirm = (): void => {
    if (phase.kind !== 'showing-codes') return;
    if (!phase.checkboxChecked) return;
    if (!TOTP_CODE_PATTERN.test(phase.totpInput)) return;
    const code = phase.totpInput;
    setPhase({ ...phase, verifyPending: true, verifyError: null });
    startTransition(() => {
      void (async () => {
        const res = await verifyTwoFactorAction(code);
        if (!res.ok) {
          setPhase((p) =>
            p.kind === 'showing-codes'
              ? { ...p, verifyPending: false, verifyError: friendlyVerifyError(res.error) }
              : p,
          );
          return;
        }
        reloadOnSuccess();
      })();
    });
  };

  const onDisableClick = (): void => {
    setPhase({ kind: 'password-disable', pending: false, error: null });
  };

  const onDisableSubmit = (password: string): void => {
    setPhase({ kind: 'password-disable', pending: true, error: null });
    startTransition(() => {
      void (async () => {
        const res = await disableTwoFactorAction(password);
        if (!res.ok) {
          setPhase({
            kind: 'password-disable',
            pending: false,
            error: friendlyDisableError(res.error),
          });
          return;
        }
        reloadOnSuccess();
      })();
    });
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
            <Button variant="destructive" size="sm" onClick={onDisableClick}>
              Disable 2FA
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={onEnableClick}>Enable 2FA</Button>
      )}

      {/* Password confirmation dialog — shared shell for enable + disable. */}
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

      {/* Backup-codes dialog (shown ONCE per enable attempt). */}
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
                  <Button type="button" variant="outline" size="sm" onClick={onCopyCodes}>
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
                  onChange={onCheckboxToggle}
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
                    onTotpInputChange(e.currentTarget.value.replace(/\D/gu, '').slice(0, 6));
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
