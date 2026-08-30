import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import { ConnectAccountOnboarding, ConnectComponentsProvider } from '@stripe/react-connect-js';
import { toast } from 'sonner';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { PageHeading } from '@/components/common/page-heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getTenantPaymentStatus,
  startTenantEmbeddedSession,
  startTenantHostedLink,
  startTenantOAuth,
} from '@/lib/tenant-payments-api';
import { VITE_STRIPE_PUBLISHABLE_KEY } from '@/env';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/payouts',
  beforeLoad: requirePermission('billing', 'read'),
  component: TenantPayoutsPage,
});

function TenantPayoutsPage() {
  const statusQuery = useQuery({
    queryKey: ['tenant-payment-status'] as const,
    queryFn: () => getTenantPaymentStatus(),
  });

  const [showEmbedded, setShowEmbedded] = useState(false);

  const fetchClientSecret = useRef(async () => {
    const res = await startTenantEmbeddedSession();
    if (!res.ok || res.data === null) throw new Error('account-session failed');
    return res.data.clientSecret;
  });

  const connectInstance = useMemo(() => {
    if (!VITE_STRIPE_PUBLISHABLE_KEY) return null;
    return loadConnectAndInitialize({
      publishableKey: VITE_STRIPE_PUBLISHABLE_KEY,
      fetchClientSecret: fetchClientSecret.current,
    });
  }, []);

  const hostedLinkMutation = useMutation({
    mutationFn: () => startTenantHostedLink(),
    onSuccess: (res) => {
      if (!res.ok || res.data === null) {
        toast.error('Failed to start onboarding. Please try again.');
        return;
      }
      window.location.href = res.data.onboardingUrl;
    },
    onError: () => toast.error('Request failed. Please try again.'),
  });

  const oauthMutation = useMutation({
    mutationFn: () => startTenantOAuth(),
    onSuccess: (res) => {
      if (!res.ok || res.data === null) {
        toast.error('Failed to start Stripe OAuth. Please try again.');
        return;
      }
      window.location.href = res.data.authorizeUrl;
    },
    onError: () => toast.error('Failed to connect Stripe account. Please try again.'),
  });

  const status = statusQuery.data?.data;
  const isLoading = statusQuery.isLoading;
  const accountType = status?.accountType ?? null;

  return (
    <>
      <PageHeading title="Payouts" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Stripe Connect</CardTitle>
            <CardDescription>Accept payments via Stripe.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading payment status…</p>
            ) : accountType === 'standard' ? (
              <StandardAccountView
                canAcceptPayments={status?.canAcceptPayments ?? false}
                chargesEnabled={status?.chargesEnabled ?? false}
                payoutsEnabled={status?.payoutsEnabled ?? false}
                onboardingStatus={status?.onboardingStatus ?? 'not_started'}
              />
            ) : status?.canAcceptPayments ? (
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-medium">
                  Payments active
                </span>
                <p className="text-muted-foreground text-sm">
                  Your Stripe account is verified and ready to accept payments.
                </p>
              </div>
            ) : status?.onboardingStatus === 'restricted' ? (
              <div className="flex flex-col gap-3">
                <span className="bg-red-100 text-red-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
                  Restricted — additional info required
                </span>
                {Array.isArray(status.requirementsDue) && status.requirementsDue.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Requirements due: {(status.requirementsDue as string[]).join(', ')}
                  </p>
                )}
                <EmbeddedOrFallback
                  connectInstance={connectInstance}
                  showEmbedded={showEmbedded}
                  onStartExpress={() => {
                    setShowEmbedded(true);
                  }}
                  onExit={() => {
                    void statusQuery.refetch();
                  }}
                  onFallback={() => {
                    hostedLinkMutation.mutate();
                  }}
                  fallbackPending={hostedLinkMutation.isPending}
                  resumeLabel="Resume onboarding"
                />
              </div>
            ) : accountType === 'express' ? (
              <div className="flex flex-col gap-3">
                <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
                  Onboarding pending — finish Stripe verification
                </span>
                <EmbeddedOrFallback
                  connectInstance={connectInstance}
                  showEmbedded={showEmbedded}
                  onStartExpress={() => {
                    setShowEmbedded(true);
                  }}
                  onExit={() => {
                    void statusQuery.refetch();
                  }}
                  onFallback={() => {
                    hostedLinkMutation.mutate();
                  }}
                  fallbackPending={hostedLinkMutation.isPending}
                  resumeLabel="Resume onboarding"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">
                  Connect your Stripe account to start accepting payments from guests.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      setShowEmbedded(true);
                    }}
                    className="w-fit"
                    disabled={showEmbedded}
                  >
                    Create new (Express)
                  </Button>
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      oauthMutation.mutate();
                    }}
                    disabled={oauthMutation.isPending}
                  >
                    {oauthMutation.isPending ? 'Redirecting…' : 'Connect existing (Standard)'}
                  </Button>
                </div>
                {showEmbedded && (
                  <EmbeddedOnboarding
                    connectInstance={connectInstance}
                    onExit={() => {
                      void statusQuery.refetch();
                    }}
                    onFallback={() => {
                      hostedLinkMutation.mutate();
                    }}
                    fallbackPending={hostedLinkMutation.isPending}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

interface StandardAccountViewProps {
  canAcceptPayments: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingStatus: string;
}

function StandardAccountView({
  canAcceptPayments,
  chargesEnabled,
  payoutsEnabled,
  onboardingStatus,
}: StandardAccountViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {canAcceptPayments ? (
        <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
          Payments active
        </span>
      ) : onboardingStatus === 'restricted' ? (
        <span className="bg-red-100 text-red-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
          Restricted — additional info required
        </span>
      ) : (
        <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
          {onboardingStatus === 'not_started' ? 'Not connected' : 'Verification pending'}
        </span>
      )}
      <p className="text-muted-foreground text-sm">
        Manage your Stripe account in your own Stripe Dashboard. Charges enabled:{' '}
        <strong>{chargesEnabled ? 'Yes' : 'No'}</strong>. Payouts enabled:{' '}
        <strong>{payoutsEnabled ? 'Yes' : 'No'}</strong>.
      </p>
    </div>
  );
}

interface EmbeddedOnboardingProps {
  connectInstance: StripeConnectInstance | null;
  onExit: () => void;
  onFallback: () => void;
  fallbackPending: boolean;
}

function EmbeddedOnboarding({
  connectInstance,
  onExit,
  onFallback,
  fallbackPending,
}: EmbeddedOnboardingProps) {
  if (connectInstance === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Embedded onboarding requires{' '}
          <span className="font-mono">VITE_STRIPE_PUBLISHABLE_KEY</span> to be configured.
        </p>
        <Button variant="outline" className="w-fit" onClick={onFallback} disabled={fallbackPending}>
          {fallbackPending ? 'Redirecting…' : 'Use hosted onboarding instead'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding onExit={onExit} />
      </ConnectComponentsProvider>
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground"
        onClick={onFallback}
        disabled={fallbackPending}
      >
        {fallbackPending ? 'Redirecting…' : 'Use hosted onboarding instead'}
      </Button>
    </div>
  );
}

interface EmbeddedOrFallbackProps {
  connectInstance: StripeConnectInstance | null;
  showEmbedded: boolean;
  onStartExpress: () => void;
  onExit: () => void;
  onFallback: () => void;
  fallbackPending: boolean;
  resumeLabel: string;
}

function EmbeddedOrFallback({
  connectInstance,
  showEmbedded,
  onStartExpress,
  onExit,
  onFallback,
  fallbackPending,
  resumeLabel,
}: EmbeddedOrFallbackProps) {
  if (showEmbedded) {
    return (
      <EmbeddedOnboarding
        connectInstance={connectInstance}
        onExit={onExit}
        onFallback={onFallback}
        fallbackPending={fallbackPending}
      />
    );
  }
  return (
    <div className="flex gap-2">
      <Button onClick={onStartExpress} className="w-fit">
        {resumeLabel}
      </Button>
      <Button variant="outline" onClick={onFallback} disabled={fallbackPending} className="w-fit">
        {fallbackPending ? 'Redirecting…' : 'Use hosted onboarding instead'}
      </Button>
    </div>
  );
}
